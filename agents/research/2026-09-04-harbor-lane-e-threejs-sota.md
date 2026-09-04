# Harbor lane E — three.js architecture state of the art

**Research cutoff:** 2026-09-04. **Target runtime:** three.js `0.185.1`, one production `WebGLRenderer`.

## Executive decision

The current published three.js release is still **r185 / npm `0.185.1`**. The official GitHub API marks r185 as latest, published 2026-07-01, and npm's `latest` endpoint resolves to `0.185.1`; therefore **nothing has shipped between this repository's pin and the current release** ([release](https://github.com/mrdoob/three.js/releases/tag/r185), [npm latest](https://registry.npmjs.org/three/latest)). The 185→186 migration notes describe work on the development branch, not a release; it must not be presented as available until r186 publishes ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186)).

That makes the right harbor program an **authoring upgrade, not a renderer upgrade**: deepen silhouettes, panel breaks, edge catches, grounding and restrained emissive cues inside the existing procedural recipe/bucket system. r185 already contains every production API this needs: `BufferGeometry`, `ExtrudeGeometry`, `mergeGeometries`, `InstancedMesh`, `BatchedMesh`, `MeshStandardMaterial`, `MeshPhysicalMaterial`, `LOD`, `Sprite`, `DecalGeometry`, texture maps, vertex colors and the existing WebGL shadow path ([r185 API source](https://github.com/mrdoob/three.js/tree/r185/src)). WebGPU/TSL features are state of the art but **not repo-adoptable without a renderer migration**.

## 1. Version reality

### Published line and relevant milestones

| Line | Status on 2026-09-04 | Architecture-relevant work | What this means here |
| --- | --- | --- | --- |
| **r183** (2026-02-20) | Published, older than repo pin | `BatchedMesh` per-instance opacity and wireframe support; renderer shadow-map improvements; TSL specification and `RenderPipeline`; `MeshPhysicalMaterial` clearcoat under rectangular lights ([r183 notes](https://github.com/mrdoob/three.js/releases/tag/r183)). | Already inherited by r185. Useful context for BatchedMesh maturity, but not a reason to change versions. |
| **r184** (2026-04-16) | Published, older than repo pin | `BatchedMesh`/`InstancedMesh` fixes; packed normal maps in `WebGLRenderer`; NodeMaterial compatibility layer for WebGL; anisotropy regression fix; position-dependent diffuse `LightProbeGrid`; nonblocking WebGPU compilation; TSL compilation reportedly 3× faster in its PR ([r184 notes](https://github.com/mrdoob/three.js/releases/tag/r184)). | Already in the installed pin. Packed normal maps, classic `MeshPhysicalMaterial.anisotropy`, `InstancedMesh`, and BatchedMesh are usable with the existing WebGL renderer. Node-material availability does **not** make a TSL production conversion compatible with this repo's renderer boundary. |
| **r185 / npm 0.185.1** (2026-07-01) | **Current published/latest** | `BufferGeometryUtils.toCreasedNormals()` optimization; WebGL fixes for double/back-sided normal maps and UBO churn; `InstancedMesh` support in render bundles (renderer path); improved GTAO integration; clustered lighting; indirect-bounce option for `LightProbeGrid`; a Neo-Gothic procedural city generator example; many WebGPU/TSL fixes ([r185 notes](https://github.com/mrdoob/three.js/releases/tag/r185)). | This repo already has the current release (`package.json:85,95`). No upgrade work exists. WebGL-safe wins are creased normals, normal maps, classic materials, batching/instancing and existing shadows. GTAONode, clustered lighting, render bundles and the official city example's node material are WebGPU/Node-renderer work and are not drop-ins. |
| **dev / prospective r186** | **Unreleased** | Migration notes currently mention a new `Object3D.dispose()`, a changed GTAO distance model, a meshoptimizer-backed asynchronous `SimplifyModifier`, `LightProbeGridWebGL` rename, and WebGPU PCF changes ([185→186 guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186), [SimplifyModifier PR](https://github.com/mrdoob/three.js/pull/34021)). | Do not plan production code against these APIs yet. The meshoptimizer simplifier is potentially useful for future generated LODs after a published upgrade, not for this harbor phase. |

### Capability matrix: usable without renderer migration

| Capability | Present at r185? | Existing `WebGLRenderer`, no switch? | Harbor verdict |
| --- | --- | --- | --- |
| `mergeGeometries()` | Yes ([docs](https://threejs.org/docs/pages/module-BufferGeometryUtils.html#mergeGeometries)) | **Yes** | Already the correct backbone. |
| `InstancedMesh` | Yes ([docs](https://threejs.org/docs/pages/InstancedMesh.html)) | **Yes** | Continue for repeated prop kinds. |
| `BatchedMesh` multi-draw, distinct geometry IDs, per-object culling/sort | Yes ([docs](https://threejs.org/docs/pages/BatchedMesh.html), [r185 source](https://github.com/mrdoob/three.js/blob/r185/src/objects/BatchedMesh.js)) | **Yes** | Technically adoptable, but not an automatic improvement over the repo's static global merges; profile only if recipes need independent visibility/update. |
| Classic PBR maps, AO/light maps, emissive maps | Yes ([`MeshStandardMaterial`](https://threejs.org/docs/pages/MeshStandardMaterial.html)) | **Yes** | Usable, but one atlas and current palette authority are preferable to per-building assets. |
| Transmission, anisotropy, clearcoat, IOR | Yes ([`MeshPhysicalMaterial`](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)) | **Yes** | Technically usable. Reserve narrowly; physical glass and brushed-metal spectacle are mostly wrong for the ukiyo-e overview. |
| glTF KHR material/mesh extensions | Loader supports anisotropy, clearcoat, dispersion, emissive strength, IOR, specular, transmission, iridescence, volume, BasisU, meshopt, and GPU instancing ([`GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html)). | **Yes**, for loaded GLBs | Procedural geometry owns harbors (`docs/pharosville/ASSET_PIPELINE.md:80-89`), so extensions are relevant only if an explicitly approved checked model cannot be procedural. |
| Classic `LOD` / sprite impostors | Yes ([`LOD`](https://threejs.org/docs/pages/LOD.html), [`Sprite`](https://threejs.org/docs/pages/Sprite.html)) | **Yes** | Usable, but whole-map stations already batch globally; tier-driven fine-detail visibility is a better first move. |
| TSL / `MeshStandardNodeMaterial` | Mature and renderer-agnostic in design; TSL emits WGSL or GLSL through its node builders ([TSL spec](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)). | **No under this repo contract.** Its supported production integration uses the renderer/node stack, not the current classic GLSL/onBeforeCompile graph. | Reject for this phase. |
| `WebGPURenderer`, RenderPipeline, GTAONode/SSGINode, clustered lights, render bundles | Yes; `WebGPURenderer` can target WebGPU or WebGL2 ([docs](https://threejs.org/docs/pages/WebGPURenderer.html)). | **No.** It is a renderer replacement even when `forceWebGL` is used. | Explicitly forbidden by `docs/pharosville/THREEJS_AGENT_REFERENCE.md:9-18`; prior parity failure is measured in `agents/2026-07-29-webgpu-spike-report.md:26-63,106-121`. |

### Why WebGPU still stays out

The prior spike is not merely old conventional wisdom. It measured a production-specific incompatibility surface: 16 classic `ShaderMaterial`s, 1,725 GLSL lines and nine `onBeforeCompile` patches needed ports (`agents/2026-07-29-webgpu-spike-report.md:74-94`); water, sky, beam and other authored surfaces failed, while pmndrs post/N8AO had no equivalent production path (`agents/2026-07-29-webgpu-spike-report.md:41-63`). Direct WebGPU rendering was vsync-bound only while bypassing the post stack, so it was not a parity performance result (`agents/2026-07-29-webgpu-spike-report.md:26-39`). r185's release notes contain useful GTAO, SSGI, clustered-lighting and WebGPU fixes, but none removes this repo-specific port bill ([r185 notes](https://github.com/mrdoob/three.js/releases/tag/r185)). The production guide now explicitly forbids a renderer switch/fallback and forbids WebGPU/TSL chunks in the bundle (`docs/pharosville/THREEJS_AGENT_REFERENCE.md:9-18,143-155`).

## 2. Repo baseline that the techniques must fit

- Dock recipes are procedural and enumerate eleven station identities and signatures (`src/three/garden-docks.ts:32-100,122-139`). Each author writes geometry into material-semantic arrays, then each array is merged into a `HarborBucketPart` (`src/three/garden-docks.ts:279-340,1753-1786`).
- The architecture kit is already deliberately data-driven for gzip: repeated boxes go through helpers and stride-6 tables (`src/three/garden-docks.ts:550-619`). Roof articulation already includes ridge beams/caps, fascia, gable plates, brackets, skirts and courses (`src/three/garden-docks.ts:433-491,616-660`). The Ethereum predecessor already has an irimoya hall, podium, campanile and empty deck (`src/three/garden-docks.ts:663-703`).
- Final rendering performs a second, world-wide merge per material bucket and uses vertex colors; repeated props and flags use `InstancedMesh` (`src/three/garden-harbor-batch.ts:193-238,241-249,260-276,340-375`). This realizes the guide's contract of one global harbor batch, one instanced mesh per prop kind and empty per-dock anchors (`docs/pharosville/THREEJS_AGENT_REFERENCE.md:124-134,171-180`).
- N8AO is already a half-resolution `N8AOPostPass` in Performance mode (`src/three/garden-post.ts:306-347,1553-1577`) within the fixed Render → N8AO → Bloom → grade/AgX → SMAA chain (`docs/pharosville/THREEJS_AGENT_REFERENCE.md:59-68`).
- Windows and quay edges already share one emissive bucket explicitly described as land-bound embers, and the material uses `HARBOR_WINDOW_EMBER_INTENSITY = 1.6` (`src/three/garden-harbor-batch.ts:44-48,241-249`).
- Media must be same-origin and narrowly owned; models are allowed only when procedural geometry cannot make a required normal-distance silhouette (`docs/pharosville/ASSET_PIPELINE.md:5-7,20-35,80-89`).

## 3. Technique catalogue for building architecture

Costs below are per the proposed eight-station harbor ring unless noted. All deltas are **planning estimates [INFERENCE]**, not GPU measurements; actual acceptance must use `npm run preview` because the repo says the bundled Playwright browser is SwiftShader (`docs/pharosville/THREEJS_AGENT_REFERENCE.md:242-261`).

### T1. Modular procedural kitbash / silhouette-first greebling

**What / why.** Build each station from a limited kit of authored massing modules—podium, hall, tower, gate, shed, crane, chimney, stepped seawall—then give each one a different dominant height rhythm and negative-space cut. Large/medium forms remain legible after small detail disappears; repeated tiny clutter does not. This is the procedural counterpart of modular environment art and fits the repo's existing helper/table authoring (`src/three/garden-docks.ts:550-619`).

**Concrete API.** Reuse `BoxGeometry`, `CylinderGeometry`, `ConeGeometry`, custom `BufferGeometry`, `Matrix4.applyToBufferAttribute`/`geometry.applyMatrix4`, and `BufferGeometryUtils.mergeGeometries()` ([merge docs](https://threejs.org/docs/pages/module-BufferGeometryUtils.html#mergeGeometries)). Repeated free-standing props stay `InstancedMesh` ([docs](https://threejs.org/docs/pages/InstancedMesh.html)).

**Cost [INFERENCE].** +0 draws when modules stay in existing buckets; +6k–18k triangles if each station gains roughly 750–2,250 silhouette/detail triangles; +0 textures. CPU build cost rises only on semantic world rebuild, not per frame. **Fit:** excellent—procedural recipes continue to own the station.

### T2. A single shared trim/mark atlas

**What / why.** One small atlas can hold horizontal/vertical trims, wall-panel borders, masonry bonds, waterline stains and chain-neutral signage marks. UV strips create consistent scale and surface rhythm without one texture set per building. Production trim-sheet practice uses one sheet across many architectural pieces to reduce materials and authoring repetition ([Gnomon trim-sheet workflow](https://www.thegnomonworkshop.com/workshops/creating-assets-architecture-for-game-environments), [three.js indexed/atlas textures](https://threejs.org/manual/en/indexed-textures.html)).

**Concrete API.** A same-origin `Texture`/`CanvasTexture`, `SRGBColorSpace` for color, and `MeshStandardMaterial.map`; author `uv` coordinates on generated geometry, optionally use `Texture.wrapS/wrapT` and `repeat/offset` ([material map docs](https://threejs.org/docs/pages/MeshStandardMaterial.html#map)). Keep palette hue in vertex color and make atlas values mostly neutral so `HARBOR_PALETTE` remains authoritative. A single RGBA atlas may encode neutral albedo in RGB and one mask in A; adding a normal map would be a second texture and is a separate decision.

**Cost [INFERENCE].** +1 texture; +0 triangles; +0 draws only if every geometry in a mapped bucket has valid UVs and shares the same atlas/material. Otherwise each textured/untextured material split costs +1 draw per affected bucket. **Fit:** good if generated deterministically and owned by the harbor batch; it requires amending the current media inventory/pipeline, not importing third-party building art. It must displace current literal micro-crack boxes or redundant surface strips, not simply overlay them.

### T3. Merged decals for wear, repairs and signage

**What / why.** Sparse projected marks—quay tide stain, patched plaster, one station emblem, a repaired seam—break sterile procedural surfaces and establish scale. `DecalGeometry` clips projected geometry to a mesh and is intended for unique details or seam covering; corner projection may distort ([docs](https://threejs.org/docs/pages/DecalGeometry.html)).

**Concrete API.** `new DecalGeometry(baseMesh, position, orientation, size)`, then merge opaque/alpha-tested decal geometries that share the atlas into one world-wide decal bucket. Use `MeshStandardMaterial({ map, alphaMap/alphaTest, polygonOffset: true, polygonOffsetFactor: -1 })`; avoid individually transparent decal meshes. For simple planar quay/wall marks, authored coplanar-offset quads are cheaper and more predictable than projection.

**Cost [INFERENCE].** Four simple planar marks per station = about +64 triangles total; clipped decals may be a few hundred. +1 draw for one global decal material and +0 textures if the shared atlas from T2 is reused. **Fit:** conditional. Geometry remains procedural, but a new decal bucket conflicts with the current seven-bucket/20-drawable discipline unless it displaces the current separate low-health crack geometry path (`src/three/garden-docks.ts:341-350`) and is counted explicitly.

### T4. Wall and roof panelization

**What / why.** Divide broad walls and roofs into bays: posts/pilasters, sill and lintel bands, recessed infill, eave shadow gaps, tile courses, buttresses, roof step-backs. Architecture reads through structural cadence and depth discontinuities; this converts a large box into an assembly without surface-noise overload.

**Concrete API.** Existing `pushBox`, `pushBoxes`, `trimBox`, `trimCourse`, `ridgeCap`, `prismGeometry` and `mergeGeometries()` (`src/three/garden-docks.ts:562-635,1444-1458,1753-1770`). Use real 0.08–0.25-unit recesses/overhangs for overview-visible shadows; use atlas lines only for sub-pixel joints.

**Cost [INFERENCE].** +0 draws and textures in existing timber/stone/wall/roof buckets; +3k–10k triangles ring-wide. **Fit:** excellent and lowest integration risk. It should replace undifferentiated wall/roof area, not add a second ornament system.

### T5. Selective micro-bevels and controlled normals

**What / why.** A small chamfer creates a moving highlight between faces; this is the key cure for procedural boxes reading as primitives. Bevel-shading practice exists specifically to alter normals around hard edges and create rounded edge highlights ([Marmoset bevel-shading explanation](https://marmoset.co/posts/revolutionize-your-3d-workflow-with-toolbags-bevel-shader/)).

**Concrete API.** For profile-based masses, `ExtrudeGeometry(shape, { depth, bevelEnabled:true, bevelSize, bevelThickness, bevelSegments:1 })` ([docs](https://threejs.org/docs/pages/ExtrudeGeometry.html)). For custom low-segment chamfer boxes, generate corner/edge faces directly and run `BufferGeometryUtils.toCreasedNormals(geometry, creaseAngle)` so broad planes stay hard while chamfers shade smoothly ([docs](https://threejs.org/docs/pages/module-BufferGeometryUtils.html#toCreasedNormals)). r185 also ships `RoundedBoxGeometry`, but it subdivides every face ([r185 source](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/geometries/RoundedBoxGeometry.js)).

**Measured warning.** Focused r185 script output:

```text
box 12 triangles 24 vertices
rounded-s1 108 triangles 324 vertices
rounded-s2 300 triangles 900 vertices
```

Command: `node --input-type=module -e "import {BoxGeometry} from 'three'; import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'; ..."`. Thus replacing every small box with `RoundedBoxGeometry` would be an avoidable 9×–25× triangle increase at these settings.

**Cost [INFERENCE].** Custom one-strip chamfers on 40–80 hero edges: +1k–4k triangles, +0 draws/textures after merge. **Fit:** excellent if limited to primary masses, parapets, tower crowns and quay nosings. Do not bevel planks, rungs, windows or hidden joints.

### T6. AO: whole-map N8AO plus baked/local cavity tone

**What / why.** AO grounds intersections and makes eaves, brackets, wall recesses and quay contacts readable. N8AO describes AO as darkening corners/crevices to restore depth and supports orthographic cameras; half resolution is a 2×–4× speed-oriented mode according to its author ([N8AO README](https://github.com/N8python/n8ao#performance)). The repo already runs Performance, half-res and depth-aware upsampling (`src/three/garden-post.ts:306-347,1553-1577`).

**Concrete API.** Keep the existing `N8AOPostPass`; tune existing `configuration.aoRadius`, `distanceFalloff`, and phase intensity only through its current ladder. For stable architectural cavities, bake a restrained scalar into vertex color on non-analytical wall/stone/roof vertices, or add a dedicated scalar attribute consumed by the existing material patch. `MeshStandardMaterial.aoMap` is also available but requires a second UV set and texture ([docs](https://threejs.org/docs/pages/MeshStandardMaterial.html#aoMap)).

**Cost [INFERENCE].** Geometry-authored vertex cavity tint: +0 draws/triangles/textures and +0–4 bytes/vertex depending on whether existing color can carry it. A new AO map: +1 texture and extra UV memory. Raising N8AO quality increases fullscreen GPU cost but no scene triangles/textures; do **not** do it for harbors alone. **Fit:** excellent for the existing N8AO; conditional for vertex AO because per-vertex RGB currently carries palette/chain colors (`src/three/garden-harbor-batch.ts:193-207`). Bake only subtle neutral value changes and preserve analytical color updates.

### T7. Contact shadows and shoreline/ground integration

**What / why.** A station that merely touches a flat quay floats. Ground it with real foundation overlap, dark waterline/tide geometry, piles entering water, a small under-eave recess, and one broad contact cue. Three.js warns that every shadow-casting light redraws all casters, while a point-light shadow redraws six views; it recommends a single shadow light, light/AO maps, or cheap shadow planes ([three.js shadow guide](https://threejs.org/manual/en/shadows.html)).

**Concrete API.** First choice: existing directional shadow map (`castShadow`/`receiveShadow`) only on primary merged masses; N8AO handles local contact. Second: one globally merged, opaque/alpha-tested painted contact mesh using `PlaneGeometry`/custom fan and `MeshBasicMaterial({ depthWrite:false, transparent:true })`, following the official fake-shadow pattern ([guide](https://threejs.org/manual/en/shadows.html)). Prefer shape geometry and vertex alpha in an existing ground-integration bucket over eight separate meshes.

**Cost [INFERENCE].** Geometry overlap/tide course: +0 draws, +200–1,000 triangles. One global painted contact batch: +1 draw, ~16–64 triangles, +0 textures if procedural vertex alpha; +1 texture if using a shared shadow mask. **Fit:** good. It must displace duplicated tiny pilings/shore clutter. Never add a harbor shadow light: it would violate both render cost and the one-dominant-light composition.

### T8. Normal map versus real geometry at this camera distance

**What / why.** Normal maps alter lighting but not shape, shadow or occlusion; displacement changes vertices and silhouette ([`MeshStandardMaterial.normalMap` and `displacementMap`](https://threejs.org/docs/pages/MeshStandardMaterial.html#normalMap)). At whole-map framing, roof ridges, eaves, parapets, pilasters, gate voids and tower crowns need geometry. Sub-centimeter grain, hammered metal and fine tile relief belong in normals only if still visible during inspection.

**Concrete API.** `MeshStandardMaterial.normalMap`, `normalScale`, tangent-space normal mapping; `BufferGeometryUtils.computeMikkTSpaceTangents()` matches normal-map bakers and glTF's tangent convention ([docs](https://threejs.org/docs/pages/module-BufferGeometryUtils.html#computeMikkTSpaceTangents)). r184 added packed-normal-map support and r185 fixed normal maps on double/back sides ([r184](https://github.com/mrdoob/three.js/releases/tag/r184), [r185](https://github.com/mrdoob/three.js/releases/tag/r185)).

**Cost [INFERENCE].** Shared normal atlas: +1 texture, +0 draws/triangles, plus tangent attribute memory and per-fragment sampling. Real signature geometry: +2k–10k triangles, +0 texture. **Fit:** geometry-first strongly fits. A normal atlas is only worthwhile after inspection proves a visible gain; otherwise it spends texture and shader bandwidth below the normal camera's pixel footprint.

### T9. LOD, tiered detail and impostors

**What / why.** LOD swaps high/mid/low objects by camera distance; hysteresis avoids flicker ([`LOD`](https://threejs.org/docs/pages/LOD.html)). A sprite is a camera-facing plane, and the official billboard guide demonstrates rendering an object to a texture to replace many 3D objects ([`Sprite`](https://threejs.org/docs/pages/Sprite.html), [billboard/facade guide](https://threejs.org/manual/en/billboards.html)).

**Concrete API.** `LOD.addLevel(object, distance, hysteresis)`, `SpriteMaterial`, `Sprite`, or generated plane impostors. For this repo, prefer the existing `setFineDetailVisible()` tier surface and author overview-safe coarse geometry into current buckets (`docs/pharosville/THREEJS_AGENT_REFERENCE.md:124-134,171-180`); only build full station LOD if triangle pressure actually approaches the ceiling.

**Cost [INFERENCE].** Fine-detail shedding has +0 draw/texture and can save 5k–20k submitted triangles at distant/tiered views. Eight unique one-view impostors need one atlas (+1 texture) and one instanced/merged draw, but introduce orientation/parallax popping and cannot receive/cast equivalent shadows. **Fit:** tiered geometry fits; station impostors are poor because cameras inspect harbors from changing bearings and the rim itself is a silhouette surface.

### T10. Merged geometry versus `InstancedMesh` versus `BatchedMesh`

**What / why.** Three.js documents merged geometry as reducing separate draw requests ([optimization guide](https://threejs.org/manual/en/optimize-lots-of-objects.html)); `InstancedMesh` handles many transforms of the **same geometry/material** ([docs](https://threejs.org/docs/pages/InstancedMesh.html)); `BatchedMesh` handles different geometries/transforms sharing one material, with per-object culling/sorting and geometry/instance IDs ([docs](https://threejs.org/docs/pages/BatchedMesh.html)).

**Concrete decision.**

- **Merged `BufferGeometry`:** static, distinct station shell pieces by material. Best here; already world-merged (`src/three/garden-harbor-batch.ts:193-238`). One draw per populated bucket, least per-object bookkeeping, but rebuild required for structural edits.
- **`InstancedMesh`:** repeated posts, lamp heads, planks, bollards, piling, net racks, reeds and flags. Already correctly used (`src/three/garden-harbor-batch.ts:260-276,340-375`). One draw per prop kind; instance matrix/color updates stay cheap.
- **`BatchedMesh`:** many different meshes that need independent visibility, transforms, color or deletion without rebuilding. r185 APIs are `addGeometry`, `addInstance`, `setMatrixAt`, `setColorAt`, `setVisibleAt`, and optional `perObjectFrustumCulled`/sorting ([docs](https://threejs.org/docs/pages/BatchedMesh.html)). It stores unique geometry in shared buffers and adds per-object bookkeeping/sorting.

**Cost [INFERENCE].** Correct current hybrid stays +0 draws. Converting seven static merged harbor buckets to seven BatchedMeshes is likely draw-neutral and memory/CPU-heavier, with no visible gain. BatchedMesh becomes worthwhile only if per-station LOD/visibility must vary inside a material bucket. **Fit:** current merge + instancing is superior for eight static stations; BatchedMesh is a measured contingency, not SOTA cargo cult.

### T11. Emissive windows as subordinate embers

**What / why.** Sparse warm windows communicate occupation and reveal building depth at night, but uniform window grids turn every station into a competing beacon. `MeshStandardMaterial.emissive`, `emissiveIntensity`, and `emissiveMap` provide self-lit color; emissive maps use color data and normally sRGB ([docs](https://threejs.org/docs/pages/MeshStandardMaterial.html#emissive)).

**Concrete API.** Continue the existing merged window/quay-edge bucket and `MeshStandardMaterial`; vary window count/shape spatially in recipe geometry, not brightness. Use vertex color or atlas mask; keep one material and no point lights. The current material is `toneMapped:false`, intensity 1.6 (`src/three/garden-harbor-batch.ts:241-249`), so the safe operation is **fewer and better-placed panes**, not raising intensity.

**Cost [INFERENCE].** +0 draws/textures if geometry windows remain; +100–500 triangles for distinct apertures. An emissive atlas reusing T2 is +0 texture; a dedicated map is +1. **Fit:** excellent. The night invariant requires beacon dominance and all dock windows/lamps to remain embers (`docs/pharosville/VISUAL_INVARIANTS.md:189-207`), so the Ethereum Mole gets a recognizable window pattern, never a brighter glow.

### T12. Silhouette and rim treatment against the haze band

**What / why.** Buildings on the rim are read first as dark/light cutouts against the graded sky seam. Use stepped roof contours, asymmetric towers, open gates, raised crane frames and deliberate gaps; let atmospheric fog simplify far detail instead of adding an outline. The repo explicitly defines the haze band as the seam into which the finite plate dissolves (`docs/pharosville/VISUAL_INVARIANTS.md:160-178`).

**Concrete API.** Existing geometry profiles plus `applyGardenHeightFog()` already applied to the harbor batch (`src/three/garden-harbor-batch.ts:90-94`). Use `material.fog = true` (default for `MeshStandardMaterial`, [docs](https://threejs.org/docs/pages/MeshStandardMaterial.html#fog)), controlled roughness and value contrast from `HARBOR_PALETTE`. A second backface-expanded outline mesh or post outline would add draw/pixel cost and create a competing graphic vocabulary.

**Cost [INFERENCE].** Silhouette edits: +0 draws/textures and +1k–6k triangles. Outline shell: roughly +7 draws (one per bucket) or an added fullscreen pass—rejected. **Fit:** silhouette edits are ideal; explicit outlines are not.

### T13. Restrained physical-material accents: anisotropy/transmission

**What / why.** Anisotropy stretches specular highlights for brushed metal; Khronos defines it for surfaces such as brushed metal and requires tangent space ([KHR_materials_anisotropy](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_anisotropy/README.md)). Transmission represents thin glass/plastic that reflects while transmitting light ([KHR_materials_transmission](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_transmission/README.md)).

**Concrete API.** `MeshPhysicalMaterial({ anisotropy, anisotropyRotation, transmission, ior, thickness, attenuationColor })`; `GLTFLoader` supports the matching KHR extensions ([physical material docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html), [loader extension list](https://threejs.org/docs/pages/GLTFLoader.html)).

**Cost [INFERENCE].** A separate physical metal/glass bucket is +1–2 draws and 0–2 textures; enabled lobes increase fragment cost, and transmission may require scene-color work/order handling. **Fit:** weak for the harbor ring. A tiny anisotropic bell/roof finial might work inside an existing metal material if the whole bucket accepts it; transmission is not warranted at whole-map distance. Neither produces architectural identity as efficiently as silhouette and edge depth.

## 4. Reference-quality survey (2025–2026)

These are actual published three.js scenes or official demos, not generic engine reels. Attribution is limited to what the linked authors/source state; visual lessons are marked `[INFERENCE]`.

1. **Three.js “City Generator” (r185, 2026).** Official example: procedurally generated Neo-Gothic terracotta blocks at sunset ([live example](https://threejs.org/examples/webgpu_generator_city.html), [r185 addition](https://github.com/mrdoob/three.js/releases/tag/r185)). The responsible published technique is procedural `CityGenerator` massing plus a single node facade material that distinguishes terracotta, dressed stone, glazing and units ([CityGenerator docs](https://threejs.org/docs/pages/CityGenerator.html)). **Transfer [INFERENCE]:** encode a few structural material zones and world-space wear while keeping one material/batch; do not transfer its WebGPU node material.
2. **Mistwood Cottage (2025-07-30).** A small stylized world built in vanilla three.js/GLSL with custom low-poly models, baked textures, fog, day/night states and selective reflective/refractive details; the author also reports that numerous textures/models made it heavy ([showcase and source](https://discourse.threejs.org/t/mistwood-cottage-a-small-stylized-world/85649)). **Responsible technique:** authored low-poly silhouette + baked lighting/material storytelling + atmospheric framing. **Transfer [INFERENCE]:** the cottage's strong single-building silhouette and fog integration fit; its many unique baked textures are the warning that motivates one shared atlas.
3. **Wcity (2026-08-10).** A fortified stylized mini-island made entirely with three.js, using a modular “Building Notebook” of houses, squares, terrain, roads, water and walls, with bird's-eye/walk views, soft shadows and day/night treatment ([showcase](https://discourse.threejs.org/t/wcity-an-interactive-island-editor-built-with-three-js/93406)). **Responsible technique:** modular architectural kit plus smooth lighting/soft shadows. **Transfer [INFERENCE]:** a small procedural kit can produce readable variety across multiple scales; PharosVille should author fixed asymmetrical compositions rather than expose a uniform parcel grid.
4. **Cinematic 3D House / IamErfan (published showcase 2026-02-14; award dated 2025-10).** Scroll-authored architectural reveal using three.js via R3F/Theatre.js; the author identifies Draco compression and texture management as the optimization route for 60 fps on mid-range devices ([showcase/source](https://discourse.threejs.org/t/cinematic-3d-house-three-js/89836)). **Responsible technique:** curated camera reveal, dense authored model, compressed geometry and controlled textures. **Transfer [INFERENCE]:** inspection compositions and texture discipline transfer; importing a dense hero GLB does not, because procedural harbor ownership is explicit.
5. **Repolis (2026-06-25).** Plain-three.js walkable city where repository activity controls building height, detail and night glow ([showcase/source](https://discourse.threejs.org/t/repolis-a-walkable-three-js-city-for-github-repos/92391)). **Responsible technique:** semantic variation in mass, detail and sparse emissive state. **Transfer [INFERENCE]:** supply/concentration should change architecture in a bounded way with DOM parity; night glow must remain an ember here.
6. **dat.city procedural ranking city (2026-07-24).** A published playful three-dimensional city whose live ranking data drives districts/towers ([showcase](https://discourse.threejs.org/t/i-made-a-procedural-city-where-rankings-become-towers/93134)). **Responsible technique:** skyline-scale procedural variation as data visualization. **Transfer [INFERENCE]:** viewers read comparative height/massing before facade minutiae, supporting supply-driven mass hierarchy; unlike a dense city, harbors must retain ma between stations.

The survey's common lesson is not “use WebGPU.” It is **hierarchical form + controlled material reuse + atmosphere + selective light**, with batching/compression as enablers. The strongest stylized examples read from silhouette before texture [INFERENCE].

## 5. Ranked repo-fit shortlist

### Budget basis

Recorded default frame: ~256 recurring draw calls, 335,105 triangles, 230 geometries, 43 textures; ceilings 700 / 500,000 / 500 / 72 (provided project baseline; rendering-count semantics also documented at `docs/pharosville/THREEJS_AGENT_REFERENCE.md:143-151`). Focused arithmetic:

```text
headroom = { draw: 444, tri: 164895, geo: 270, tex: 29 }
```

Computed with `node -e` subtraction from the recorded values. Headroom is not a spending target: compositional attention, bundle size and real-GPU p90 remain constraints.

| Rank | Adopt for harbor rework | Expected visual gain | Effort | Planned default-frame delta [INFERENCE] | Named invariant risk and mitigation |
| ---: | --- | --- | --- | --- | --- |
| **1** | **Silhouette-first station massing and negative space (T1/T12)** | Very high: makes all harbors recognizable at overview and lets the Ethereum Mole be monumental through form rather than light. | Medium–high | **+0 draws, +8k–18k tri, +0 tex** → about 343k–353k triangles. | Risk: lighthouse loses primary-anchor status; keep Ethereum Mole lower/darker, remove one existing precinct secondary if it enters the Pharos precinct. Invariant: lighthouse primary, and only three precinct secondary reads (`VISUAL_INVARIANTS.md:215-222`). |
| **2** | **Selective one-strip chamfers on primary edges (T5)** | High: moving edge highlights stop halls/towers/quays reading as boxes. | Medium | **+0 draws, +2k–4k tri, +0 tex**. Never wholesale `RoundedBoxGeometry`; measured 108 triangles versus 12 for a box at segment 1. | Risk: uniform polished toy look violates asymmetry/ma; vary radius by material and omit bevels on worn/hidden edges. |
| **3** | **Wall/roof structural panelization using current buckets (T4)** | High at inspection, medium at overview: bays, eaves, recessed infill and courses establish architectural scale. | Medium | **+0 draws, +4k–9k tri, +0 tex**. | Risk: ornament density erases emptiness. Each panelization pass must replace broad blank surfaces selectively, preserving at least one calm face/roof field. Invariant: empty surface is positive (`VISUAL_INVARIANTS.md:223-239`). |
| **4** | **Foundation, tide line and contact-depth integration (T7)** | Medium–high: makes enlarged stations belong to the rim rather than hover on it. | Low–medium | **+0 draw, +0.5k–1.5k tri, +0 tex** if folded into stone/timber; at worst +1 global contact draw. | Risk: new water mark conflicts with complete sea vocabulary. Keep it land/structure geometry and displace redundant piling/clutter; do not add a water shader term (`VISUAL_INVARIANTS.md:240-247`). |
| **5** | **Overview/inspection detail split through existing fine-detail surface (T9)** | Medium: preserves rich close views while submitting only signature geometry in distant/low tiers. | Medium | **+0 resources; saves ~5k–15k submitted tri [INFERENCE]** when detail is hidden. | Risk: interaction tier must not visibly blink scenery; follow guide requirement that interaction treats visible scenery like balanced (`THREEJS_AGENT_REFERENCE.md:87-98`). Only sub-silhouette greebles may shed. |
| **6** | **Sparse, irregular window apertures in existing ember bucket (T11)** | Medium: inhabits each structure and differentiates facade rhythm without another light source. | Low | **+0 draw, +0.1k–0.5k tri, +0 tex**. | Direct risk to “one dominant light / one secondary”; retain intensity, vary count/shape, and thin windows before dimming. Never give the Ethereum Mole a brighter material or point light (`VISUAL_INVARIANTS.md:189-207`). |
| **7** | **One neutral harbor trim/mark atlas (T2), only after geometry pass** | Medium at inspection, low at overview: masonry bonds, panel borders, repair marks and signs provide material scale. | High because procedural UV authoring and asset pipeline checks are needed | **+0 draw if all target bucket UVs are compatible; +1 texture; +0 tri.** Allow at most +1 draw if a single atlas bucket is unavoidable. | Risk: palette authority and texture clutter. Keep neutral/value-only, derive colors from `HARBOR_PALETTE`, reuse one atlas, and displace literal crack/micro-trim geometry. Asset rule requires deterministic same-origin ownership (`ASSET_PIPELINE.md:5-7,80-89`). |
| **8** | **Keep current N8AO; add restrained geometry-local cavity value only where N8AO misses (T6)** | Medium: improves eave/bracket/recess legibility without a new pass. | Low–medium | **+0 draws/tri/textures** if multiplied into non-analytical vertex color; otherwise defer. | Risk: dark halos or analytical color corruption. Do not raise global AO quality/radius for harbors and do not bake AO into chain accent vertices that runtime recolors (`garden-harbor-batch.ts:127-131,193-207`). |

**Combined upper planning case [INFERENCE]:** ranks 1–6 plus conservative atlas/cavity work add roughly **0–1 draws, 14.6k–33.5k triangles and 1 texture**, yielding about **256–257 draws, 349.7k–368.6k triangles and 44 textures**—comfortably below the numerical ceilings. Real-GPU preview and actual renderer census remain required because these are authoring estimates.

### Explicit attractive-but-wrong rejections

1. **Reject a WebGPU/TSL/RenderPipeline migration for the harbor rework.** It is attractive because r185 showcases GTAO, SSGI, clustered lighting, node facade shaders and a procedural city ([r185 notes](https://github.com/mrdoob/three.js/releases/tag/r185), [TSL spec](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)). It is wrong because this repo forbids a renderer switch/fallback (`THREEJS_AGENT_REFERENCE.md:9-18`) and measured missing parity across water, sky, fire, beam and post (`webgpu-spike-report.md:41-63,106-121`). It adds migration risk without solving the actual architectural-authoring deficit.
2. **Reject wholesale `RoundedBoxGeometry` or beveling every primitive.** It is attractive because highlights improve every edge. It is wrong because the focused r185 count is 108 triangles at segment 1 and 300 at segment 2 versus 12 for `BoxGeometry`; applied to the file's many boxes it would rapidly consume triangle headroom and make every material equally soft. Use custom one-strip chamfers only on hero edges.
3. **Reject unique GLB buildings and per-harbor 2K PBR texture sets.** They are attractive because glTF supports advanced compressed meshes/materials and `GLTFLoader` implements many KHR extensions ([loader docs](https://threejs.org/docs/pages/GLTFLoader.html)). They are wrong because procedural geometry owns ordinary scenery and a model is permitted only when procedural work cannot produce the normal-distance silhouette (`ASSET_PIPELINE.md:80-89`). Eight unique texture sets also defeat atlas/material batching and consume the 29-texture headroom for detail mostly invisible at overview.
4. **Reject transmissive glass facades and anisotropic spectacle as identity.** They are technically supported by `MeshPhysicalMaterial` and Khronos material extensions ([three.js docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html), [transmission](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_transmission/README.md), [anisotropy](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_anisotropy/README.md)). They add per-fragment/material complexity, sorting/refraction concerns and photoreal material language while doing little for whole-map silhouette. Use rough standard materials and geometry.
5. **Reject a new outline/post edge pass.** It is attractive for illustrative readability. It is wrong because the scene already has a signed-off post chain (`THREEJS_AGENT_REFERENCE.md:59-68`), offscreen passes count against the draw census unless specially scheduled (`THREEJS_AGENT_REFERENCE.md:143-151`), and a universal outline would compete with the haze/bokashi vocabulary. Architectural rim readability should come from value, bevel catches and silhouette.
6. **Reject station impostors as the first LOD.** The official facade technique can replace geometry with camera-facing sprites ([three.js billboard guide](https://threejs.org/manual/en/billboards.html)), but unique rim buildings are inspected from varying bearings, need coherent fog/shadows, and define the plate silhouette. Existing fine-detail shedding buys the relevant saving without billboard popping.

## 6. Implementation translation for the plan author

1. Preserve `DockRecipe` as the authoring boundary; extend its existing geometry kit and feature telemetry rather than attach per-station mesh trees (`src/three/garden-docks.ts:109-120,275-410`).
2. Keep the existing global material buckets and prop instancing. Any technique that proposes a new material must state its exact world-wide draw and what bucket/geometry it displaces (`src/three/garden-harbor-batch.ts:193-276`).
3. Design each station at three scales: blurred-frame silhouette; overview-visible structural breaks; inspection-only greebles. The first two never tier out; only the third uses `fineDetail`.
4. Make the Ethereum Mole monumental with podium extent, stepped mole, one asymmetrical tower/crown, an open void and heavy quay contact—never with a second beacon, brighter emissive, transmissive facade or universal ornament. It remains subordinate to the Pharos lighthouse and must name any precinct secondary read it displaces (`docs/pharosville/VISUAL_INVARIANTS.md:189-222`).
5. Spend geometry before textures: panelization and selective chamfers first; one neutral atlas only if preview proves that material scale is missing. This aligns with the asset rule that ordinary look problems should not be solved by adding media (`docs/pharosville/ASSET_PIPELINE.md:80-89`).
6. Do not replace the existing merge/instance hybrid with `BatchedMesh` unless a measured requirement for per-station visibility/LOD cannot be represented by the current fine-detail split. r185 BatchedMesh is mature enough, but the current static use case does not need its bookkeeping.
7. Validate final cost only in the operator's Chrome via `npm run preview`; Playwright/SwiftShader frame time is explicitly non-evidence (`docs/pharosville/THREEJS_AGENT_REFERENCE.md:242-261`).

## Source index

### Primary external sources

- three.js [r183](https://github.com/mrdoob/three.js/releases/tag/r183), [r184](https://github.com/mrdoob/three.js/releases/tag/r184), [r185](https://github.com/mrdoob/three.js/releases/tag/r185), [npm latest](https://registry.npmjs.org/three/latest), and [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide).
- three.js API: [`BatchedMesh`](https://threejs.org/docs/pages/BatchedMesh.html), [`InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html), [`LOD`](https://threejs.org/docs/pages/LOD.html), [`Sprite`](https://threejs.org/docs/pages/Sprite.html), [`DecalGeometry`](https://threejs.org/docs/pages/DecalGeometry.html), [`ExtrudeGeometry`](https://threejs.org/docs/pages/ExtrudeGeometry.html), [`BufferGeometryUtils`](https://threejs.org/docs/pages/module-BufferGeometryUtils.html), [`MeshStandardMaterial`](https://threejs.org/docs/pages/MeshStandardMaterial.html), [`MeshPhysicalMaterial`](https://threejs.org/docs/pages/MeshPhysicalMaterial.html), [`GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html), and [`WebGPURenderer`](https://threejs.org/docs/pages/WebGPURenderer.html).
- three.js [TSL specification](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language), [shadow guide](https://threejs.org/manual/en/shadows.html), [billboard/facade guide](https://threejs.org/manual/en/billboards.html), and [object-merging guide](https://threejs.org/manual/en/optimize-lots-of-objects.html).
- Khronos [`KHR_materials_anisotropy`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_anisotropy/README.md) and [`KHR_materials_transmission`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_transmission/README.md).
- N8AO [official repository/README](https://github.com/N8python/n8ao).

### Repository evidence

- Renderer/batch/post boundary: `docs/pharosville/THREEJS_AGENT_REFERENCE.md:9-18,59-68,124-180,242-261`.
- Procedural asset rule: `docs/pharosville/ASSET_PIPELINE.md:5-7,20-35,80-89`.
- Procedural recipes and merges: `src/three/garden-docks.ts:32-139,275-410,433-491,550-703,1444-1458,1753-1786`.
- World-wide bucket merge, instancing and ember material: `src/three/garden-harbor-batch.ts:44-48,90-116,193-276,340-375`.
- Existing N8AO setup: `src/three/garden-post.ts:306-347,1553-1577`.
- Composition/light/emptiness invariants: `docs/pharosville/VISUAL_INVARIANTS.md:151-178,189-247`.
- Prior measured renderer migration: `agents/2026-07-29-webgpu-spike-report.md:26-121`.

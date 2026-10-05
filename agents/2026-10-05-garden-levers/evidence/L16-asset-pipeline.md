# L16 — Asset pipeline & authoring workflow

## Verdict

[INFERENCE] The ceiling is not procedural geometry itself; it is **code-only shape authoring plus a deliberately textureless publishing contract**. Introduce a small, visually authored garden kit and restrained surface library, while keeping placement, analytical semantics, batching and motion procedural. Converting more TypeScript primitives into GLBs without changing authoring would reproduce today's look.

## Evidence

1. **Confirm hypothesis 1's toy-diorama reading, not its implied technical cause.** `outputs/holistic/overview.png` exposes the square plate and repeated rounded planting; `day.png` contrasts a finely articulated tower with slab roofs, bulbous banks and pad-shaped foliage. But trees and foreground already use smooth shading (`src/three/garden-niwaki.ts:17-28`); “make everything smooth” is not the remedy. Garden vocabulary must become legible through silhouette, surface and spatial relationships, not a prop inventory (`PRODUCT.md:28-42`).
2. **Confirm hypothesis 2.** `day.png` bottom band is a mostly unarticulated green swell; upper-left branch reads as thick rods with flattened caps. This is partly prescribed: the threshold must remain “three smooth, textureless, unpickable draws” under 15k construction triangles (`VISUAL_INVARIANTS.md:47-57`). Its screen-authored brow/height code is sophisticated (`src/three/garden-threshold.ts:94-168`), yet the resulting surface has little garden-specific information.
3. **The GLBs are also code-authored.** The manifest records `deterministic-procedural`, null source asset, single LOD and zero textures (`src/three/garden-models.ts:100-105,175-192,256-282`). Both generators use Three's GLTFExporter; `check:garden-models` simply regenerates and compares bytes (`package.json:50-51`; `scripts/pharosville/generate-garden-lighthouse.mjs:119-145`). The shipped directory contains nine GLBs: lighthouse ~190 KiB, heroes ~20–34 KiB each. Meshopt and vertex-AO/weathering are **already present**, not new levers (`garden-models.ts:263-269`; `scripts/pharosville/glb-meshopt.mjs:1-15`).
4. **Textured Blender export is not a drop-in.** Runtime uses a custom GLB parser, deliberately omitting texture/animation machinery (`garden-models.ts:519-568`); it installs position/normal/colour, not UVs, and reads material factors, not maps (`:630-658`). Tests explicitly forbid images/textures (`garden-models.test.ts:48-52`). Hero merging also replaces source materials with textureless vertex-colour materials (`garden-ships.ts:1300-1363`). The bespoke compressor expects geometry-target buffer views, not embedded images (`scripts/pharosville/glb-meshopt.mjs:207-239`).
5. **GPU headroom is real; bundle/attention headroom is not unlimited.** Day reports 179 calls, 179 geometries, 374,708 triangles, 50 textures and GPU frame p50 2.47 ms (`outputs/holistic/day.json:30,51-56,1697-1700`). Overview has 43 textures (`overview.json:1626-1629`), so ASSET_PIPELINE's “72/72” claim is not this capture's census (`:63-66`). Hard caps remain; tighter Reborn acceptance is 285 scene calls with extensions, 480k triangles, 60 textures (`CONTRACTS.md:385-392`). Last release used 948/963 KiB aggregate JS gzip (`agents/2026-10-02-visual-upgrade/02-execution-record.md:31`). Moving geometry to public assets does not automatically shrink JS when equivalent detailed fallback code remains.
6. **Confirm hypothesis 3 visually, but refute assets as its standalone fix.** `night.png` foreground loses almost all detail; `golden.png` improves tower modelling but retains the same crude framing branch. Textures cannot repair missing illumination or garden composition. Lighting/composition owners must act with this pipeline. Fleet encodings/API drift are outside this lens.

## Levers — ranked

Impact, effort and prospective benefits below are [INFERENCE], not measured candidate outcomes.

### 1. Author a selective garden kit, not a replacement world

**Change:** Blender-author one foreground kuromatsu branch/tree, three intentional ishigumi stones, a moss/gravel threshold insert and one roof/engawa kit. Keep checked `.blend` sources and named roots; export geometry into existing threshold/flora/DockRecipe material buckets rather than cloning whole scene graphs per station. Replace visible weak forms, not add clutter. Retain procedural placement, risk geography and thin aligned failure forms. Start geometry/vertex-colour-first so texture migration is not prerequisite to silhouette improvement.

**Impact 5/5:** changes the large rest-frame garden masses, where today's vocabulary fails. **Effort L. Risk:** requires actual DCC art direction; more triangles are not better composition. **Contracts:** explicitly amend procedural ownership (`CONTRACTS.md:399-406`), generator-only policy (`ASSET_PIPELINE.md:37-46`) and threshold prescription; retain hierarchy and negative space (`VISUAL_INVARIANTS.md:38-57`). **Dependencies:** vegetation, terrain, architecture, composition. **Verification:** matched full-frame/16px-blur operator review, gate-size captures, measured owner deltas and Apple M5 Pro pacing; focused threshold/flora/dock tests plus visual/perf lanes.

### 2. Ship a shared surface library with a clean loader cutover

**Change:** use one garden atlas family: palette-controlled base colour, normal, packed occlusion/roughness/metalness, mipmapped and KTX2-compressed. Prioritise moss/gravel, stone and timber; bake local AO/cavity, not noon lighting. Replace the bespoke parser with GLTFLoader + existing MeshoptDecoder; add KTX2Loader only for the approved maps, `detectSupport(renderer)`, local three-version-matched Basis files and renderer-owned disposal. Preserve shared material batching; do not texture the whole fleet. Do not attach textured heroes through the current map-discarding merger.

**Impact 4/5:** near surfaces acquire tactile scale without photorealistic noise. **Effort M** for loader/library integration, excluding art production above. **Risk:** atlas bleeding, palette drift, decode/upload stalls and larger vendor chunk. Meshopt is already funded; Draco is an alternative only after measured byte/decode comparison, not a second mandatory decoder. **Contracts:** amend zero-texture model tests/budgets and threshold texture prohibition; retain shared palette, desktop gate and same-origin assets (`ASSET_PIPELINE.md:20-23`; `VISUAL_INVARIANTS.md:114-122`). **Dependencies:** lighting/materials, bundle owner, kit UVs. **Verification:** actual compressed transfer bytes, cold decode-to-first-correct-frame and logical texture storage; no invented load-time saving. Existing upload scheduler hides models until upload drains (`world-renderer.ts:436-482`): keep fallback visible until the replacement is genuinely ready. Run model/URL/gate tests, bundle checks and reference GPU captures.

### 3. Promote the generator into a reproducible asset compiler

**Change:** extend current manifest/publishing workflow with pinned Blender/export/optimisation versions, source hashes, license/provenance, deterministic export options, Meshopt compression and optional KTX2 atlas processing. Keep generated artifacts immutable. Add Khronos glTF validation and actual decoded primitive/triangle/vertex/texture census, UV/normals checks, internal-URI allowlisting, atlas dimensions/mips and extension allowlists. Current mesh-count-as-draw proxy and declared geometry budgets are insufficient for multi-primitive imports (`garden-models.test.ts:36-52`; `garden-models.ts:763-786`). Generate RUNTIME_FACTS from this contract rather than maintaining another asset registry.

**Impact 4/5:** makes authored art maintainable and safe to iterate. **Effort M. Risk:** toolchain reproducibility and manifest churn; compression must preserve anchors and fine silhouettes. **Contracts:** extend checked-model provenance/schema (`garden-models.ts:41-109`), retain origin/anchor/pick alignment (`ASSET_PIPELINE.md:27-46`). **Dependencies:** approved kit schema and loader extensions. **Verification:** clean-source regeneration equality, validator results, actual-vs-manifest checks, injected broken/missing media and no-request blocked viewport; existing `check:runtime-media`, model tests, build/bundle gates and visual/perf lanes after adaptation. No current configured Khronos-validator command was found.

### 4. Gate art before committing pipeline complexity

**Change:** review same-camera silhouette/material boards, then one in-app kit candidate. AI-assisted references remain under `outputs/` and require operator approval; translate approved forms into owned source assets (`ASSET_PIPELINE.md:94-96`). Approve from full resting frames, gate sizes, night and overview—not isolated Blender beauty renders.

**Impact 3/5. Effort S. Risk:** beautiful references masking unreadable data. **Contracts:** product anti-spectacle/attention rules (`PRODUCT.md:33-57`; `VISUAL_INVARIANTS.md:99-103`). **Dependencies:** operator/art direction and composition. **Verification:** matched capture identity and explicit whole-frame perceptual improvement, alongside unchanged DOM/data semantics.

## Do-not-do / traps

- No whole-map GLB, per-tree material stacks, runtime-generated AI media, remote decoder/CDN URLs or renderer switch.
- No directionally baked lightmaps: wall-clock light changes; glTF lightmap support would require additional runtime convention. AO is already used—improve its authoring, avoid double-darkening with N8AO.
- No automatic bundle-cap raise or spending all measured RTX headroom; include reflections/shadows in triangle deltas and test the M5 Pro.
- No another numeric micro-craft pass: A2/B1/P1 were indistinguishable, W1 unwarranted (`02-execution-record.md:17-20`). A file-format conversion is equally invisible unless its authored picture changes.

## Invariants worth challenging

Challenge **textureless three-draw threshold**, **procedural-only scenery ownership**, and **generator-only source authorship**, not deterministic publishing. Those rules encode today's technique rather than garden quality. Preserve unpickability, semantic roots, analytical parity, finite geography, attention budget and performance ceilings. Full-frame polish need not mean photographic assets.

## Captures wanted

Run serially against matched baseline/candidate fixtures; commands use existing preview flags (`scripts/pharosville/preview.mjs:46-98`). Repeat the asset metrics on reference hardware. Cold-load transfer/decode evidence needs a separate recorded network/performance trace; these captures alone cannot prove it.

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1600 --height 1000 --hash '#t=12.25' --clean --blur-audit --draw-census --texture-census --assert --out levers/l16/day.png --json levers/l16/day.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1600 --height 1000 --hash '#t=18.5' --clean --blur-audit --assert --out levers/l16/golden.png --json levers/l16/golden.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1600 --height 1000 --hash '#t=22' --clean --metrics --assert --out levers/l16/night.png --json levers/l16/night.json
```

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1200 --height 640 --hash '#t=12.25' --assert --out levers/l16/gate-wide.png --json levers/l16/gate-wide.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 900 --height 720 --hash '#t=12.25' --assert --out levers/l16/gate-standard.png --json levers/l16/gate-standard.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1600 --height 1000 --hash '#cam=0,0,0.28&t=12.25' --draw-census --texture-census --assert --out levers/l16/overview.png --json levers/l16/overview.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1600 --height 1000 --hash '#t=12.25' --reduced --assert --out levers/l16/reduced.png --json levers/l16/reduced.json
```

Review only: no source changes, tests, builds or browser runs performed.

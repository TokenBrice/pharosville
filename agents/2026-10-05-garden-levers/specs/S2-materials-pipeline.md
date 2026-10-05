# S2 — One garden material language and reproducible assets

## Lever statement
Replace coloured-clay scenery with restrained, authored stylized PBR: moss feels soft, stone mineral, gravel tended, timber worked. One shared surface library connects the shaded seat to the Pharos without decorating every pixel. Keep existing physical light, print inks, analytical cloth and shared air; improve material authorship, not the renderer brand.

## Verified current state
- The pictured bank is smooth and night foreground nearly black (`outputs/holistic/day.png`, `night.png`). **Not everything is flat-shaded:** threshold smoothness/texturelessness are expressly tested (`src/three/garden-threshold.test.ts:197-222`); the bible freezes that recipe (`docs/pharosville/VISUAL_INVARIANTS.md:47-57`).
- Patch composition already preserves earlier callbacks/cache keys (`src/three/garden-aerial.ts:372-386`). Print ink modifies indirect diffuse and exempts identity/practicals (`src/three/garden-print-inks.ts:244-291`). Reuse both.
- Custom GLB parsing has no VEC2, UVs or maps (`src/three/garden-models.ts:519-568,630-658`); tests forbid images/textures and use mesh count as draw proxy (`src/three/garden-models.test.ts:49-52`). Hero merging discards source materials (`src/three/garden-ships.ts:1300-1363`). General loading alone therefore cannot deliver textured heroes.
- Meshopt already exists. Its compressor rejects non-GPU buffer views, including embedded image records (`scripts/pharosville/glb-meshopt.mjs:58-95,224-229`). Provenance only permits procedural/null-source (`src/three/garden-models.ts:100-109`); publishing only permits generators (`docs/pharosville/ASSET_PIPELINE.md:37-46`).
- Surface textures already exist: mipmapped island moss roughness/gravel normals (`src/three/garden-island.ts:130-162,934-939,2073-2077`). Shared noise is **not** a surface atlas: raw data, no mips (`src/three/garden-noise-pack.ts:57-65`). Keep dither separate.
- Golden Garden allows C<0.16/honey noon (`src/systems/palette.ts:6-21,55-60`); its test enforces 0.16 (`src/systems/palette.test.ts:34-50`). Bible instead specifies neutral noon/C0.12 (`docs/pharosville/VISUAL_INVARIANTS.md:71-77,114-122`). This is drift, not proof palette causes haze.
- Correct historical “72/72” wording: today's rest is 179 calls/374,708 triangles/50 textures (`outputs/holistic/day.json:30,1699-1700`), not fully spent. Caps are 72 hard/60 acceptance (`docs/pharosville/CONTRACTS.md:385-392`). Last release: 948/963 KiB JS gzip (`agents/2026-10-02-visual-upgrade/02-execution-record.md:31`), not a fresh build measurement.

## Target state and shared contract
At neutral noon the resting seat has broad moss islands, matte granular gravel, bedded stone and directional weathered timber; tile and plaster are distinct without noisy detail. At night those same masses remain distinguishable through S4 fill, not emission. At 1200×640 and 900×720 detail filters away before becoming shimmer; shapes/value separation survive. Reduced motion is the identical complete static material state, with no texture animation.

`applyGardenSurface(material,{role,mapping,metresPerRepeat,detailStrength})` uses roles `moss|stone|gravel|earth|timber|plaster|roofTile`. Mapping is `worldXZ|triplanar|uv`; structural timber uses grain-oriented UVs. Broad authored vertex colours/weights own composition. All dielectric roles have metalness 0: moss/gravel/earth roughness 0.9–1, stone/plaster 0.8–0.98, timber 0.72–0.92, tile 0.65–0.85. Normal relief is shallow. Static coastal wetness lowers roughness without manufacturing a tide; S7 owns depth/substrate/exposure, S5 owns optical use.

Order: existing deformation → surface/base/normal/roughness → S4 indirect irradiance → print ink → aerial. Cache keys encode recipe/mapping, not uniform values. Cloth/mon/nobori, issuer trim, data traces and practical emission retain explicit exemptions; no colour/detail over analytical marks. Flora retains its foliage/snow/wind patches, not a gravel treatment.

## Ordered packets
File lists name implementation targets (new files explicitly marked); amendment lists name additional documentation/coverage. Budget deltas below are **estimates**, not earned allowances. S1 geometry starts immediately, without waiting for any texture packet.

### S2-P1 · Material recipes without textures · M
**Goal:** one preparation hook usable by geometry-first builders.
**Files:** new `src/three/garden-surfaces.ts`; `src/three/garden-aerial.ts`; `src/three/garden-print-inks.ts`.
**Change:** implement typed roles, mapping/config, idempotent patching and explicit exemption metadata; support instances, cloned materials and vertex weights. Preserve existing shaders; install fleet/foliage deformation first. Expose neutral recipes independently of loading.
**Amend:** `docs/pharosville/ASSET_PIPELINE.md` §Inventory and ownership; new `src/three/garden-surfaces.test.ts`; `src/three/garden-aerial.test.ts` patch/cache-key cases; `src/three/garden-print-inks.test.ts` exemptions. Rewrite no safety pins.
**Budget:** +0 calls/tris/textures; +2–4 KiB JS.
**Acceptance:** C1/C2 preserve identities and calm value masses; `npm test -- src/three/garden-surfaces.test.ts src/three/garden-aerial.test.ts src/three/garden-print-inks.test.ts` covers compile composition/clone/idempotency.
**Depends:** `S9:destination`. **Risk/rollback:** shader ordering; revert recipe adoption together, not leave two prep paths.

### S2-P2 · Reproducible asset compiler · L
**Goal:** checked authored sources, deterministic publishing.
**Files:** new `scripts/pharosville/compile-garden-assets.mjs`; `scripts/pharosville/glb-meshopt.mjs`; `scripts/pharosville/generate-runtime-facts.mjs`; `src/three/garden-models.ts`; `package.json`; new `assets/pharosville/garden-assets.json`.
**Change:** accept existing procedural generators and checked `.blend` sources under `assets/pharosville/`; pin Blender LTS/exporter/optimizer versions and hashes in the source manifest. Export named roots, metres, normals, UVs, roles/anchors; canonicalize ordering, Meshopt-compress geometry, preserve/rebase image views. Record source/output SHA, author/license, tool versions and export options. Run [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) before/after compression; fail on errors, explicitly review warnings. Census decoded primitives, index triangles, vertices, unique maps/materials, bounds, anchors, extensions, mips and bytes; generate runtime facts from it. Retain compression-deviation limits.
**Amend:** `docs/pharosville/ASSET_PIPELINE.md` §§Checked models/Validation; `docs/pharosville/CONTRACTS.md` §Media and motion procedural-only rule; new compiler tests; `src/three/garden-models.test.ts` replaces mesh-count proxy with actual census, deletes blanket zero-image assertions, retains per-asset budgets/hash/anchors.
**Budget:** runtime +0 resources; +0–1 KiB metadata; build tooling not browser JS.
**Acceptance:** `npm test -- src/three/garden-models.test.ts`; new `node --test scripts/pharosville/compile-garden-assets.test.mjs`; clean-source compile/check byte equality, validator/census reports; C1 geometry-only picture parity.
**Depends:** none; authored kit inputs come from S1/S7. **Risk/rollback:** DCC nondeterminism; reject unstable export and retain previous checked artifacts, never bypass validation.

### S2-P3 · Clean general-loader cutover and earned byte budget · M
**Goal:** remove the textureless parser, not extend another glTF implementation.
**Files:** `src/three/garden-models.ts`; `src/three/world-renderer.ts`; `scripts/bundle-budgets.mjs`; `scripts/pharosville/validate-runtime-media.mjs`.
**Change:** GLTFLoader+existing MeshoptDecoder behind desktop renderer boundary; retain library API/cache/anchor checks and aligned failure forms. Delete custom parser/types. Enforce internal-URI allowlist (absolute local atlas or embedded image, no remote URI); preserve maps and shared ownership. Dispose unique geometry/material/textures/ImageBitmaps once, including late completion and detached cached sources; keep scheduled upload/repaint.
**Amend:** `docs/pharosville/ASSET_PIPELINE.md` §§Checked models/Adding media; `src/three/garden-models.test.ts` rewrites subset-only loader test, retains clone/cache/failure tests; `src/three/world-renderer.test.ts` loading/disposal/gate coverage.
**Budget:** +0 draws/tris/maps for existing assets. Source-only gzip measured here: GLTFLoader 25.4 KiB; KTX2+parser/worker utilities 15.4 KiB. These are **not production deltas**. Estimate net +20–40 KiB for cutover after deletion; existing 15 KiB headroom is inadequate. Candidate build determines actual graph weight. Approve aggregate measured+5% capped at 1,024 KiB; retain raw/per-chunk/frame-time gates. Exceeding that needs a new explicit decision, not automatic inflation.
**Acceptance:** `npm test -- src/three/garden-models.test.ts src/three/world-renderer.test.ts`; `npm run build`, `npm run check:bundle-size`, `npm run check:viewport-gate`, `npm run check:runtime-media`; C1/C2 and missing-image/late-disposal capture have aligned fallbacks; blocked sizes make zero asset/decoder requests.
**Depends:** P2. **Risk/rollback:** startup/ownership; revert cutover with its textured inputs, never ship parallel loaders.

### S2-P4 · Three-map surface atlas · L
**Goal:** tactile near detail without noise/residency proliferation.
**Files:** new `src/three/garden-surface-atlas.ts`; `src/three/garden-surfaces.ts`; `scripts/pharosville/compile-garden-assets.mjs`; `scripts/pharosville/validate-runtime-media.mjs`; `src/three/world-renderer.ts`.
**Change:** compile one 1024² atlas family (eight cells, seven roles): sRGB neutral albedo modulation, linear normal, linear ORM. Independently generate guttered periodic tile mips; PNG fallback is three compiler-emitted mip strips decoded once into `Texture.mipmaps` (never GPU-generated cross-cell mips), KTX2 stores the same authored levels. Compute gradients before repeat/fract; `textureGrad`/footprint fade reaches role-average colour/neutral relief before cells outgrow gutters. World-XZ ground; limited triplanar steep stone with reoriented normals, UV architecture; no three-axis samples everywhere. Export `GARDEN_SURFACE_GLSL`, uniforms and `GardenSurfaceAtlasLease` for Standard and S5 ShaderMaterial. Last lease disposes maps; materials do not. No decorative rake lines under S3's PSI trace. Bake cavity only, not sunlight/bounce or broad N8AO darkness.
KTX2 is conditional: same-camera PNG/UASTC comparison on M5/RTX must preserve normals and reduce upload/resident cost enough to offset decode/startup. If earned, add renderer-detected KTX2Loader and pinned local Basis files, not remote URLs or default PNG duplication. Source-gzip Basis wrapper+WASM is 254.4 KiB; account separately for public decoder transfer, including JS outside bundle checker. Decoder+atlas compressed transfer target ≤768 KiB, reported with cold first-correct-frame timing.
**Amend:** `docs/pharosville/ASSET_PIPELINE.md` §§Inventory and ownership/Validation; new `src/three/garden-surface-atlas.test.ts` lifecycle/filtering cases; runtime-media scanner validates mip strips, KTX2 headers/levels, local transcoder hashes and GLB internal URIs. P3 byte reports include KTX2; retain shared-noise bit-exact pins.
**Budget:** +3 maps maximum; +0 calls/tris; +3–6 KiB JS without KTX2, estimated additional +10–20 with it. RGBA8 mip fallback ≤16 MiB; typical 8bpp compressed family ≈4 MiB, measure actual target format. Temporary peak 53 textures from today's 50, never both families resident.
**Acceptance:** `npm test -- src/three/garden-surface-atlas.test.ts src/three/garden-surfaces.test.ts src/three/garden-noise-pack.test.ts`; C1–C6, cold trace, repeated rebuild/teardown returns census to baseline.
**Depends:** P1/P2; P3 only for KTX2; `S9:M5-calibration`. **Risk/rollback:** bleed/bandwidth; switch compiler output format without both families resident. KTX2 acceptance also re-runs P3 build/bundle/viewport/media gates.

### S2-P5 · Reconcile the dye lot · M
**Files:** `src/systems/palette.ts`; `src/systems/palette.test.ts`; `docs/pharosville/VISUAL_INVARIANTS.md`.
**Goal/change:** supporting world pigments C≤0.12, restrained moss/roof/earth values; remove Golden Garden C0.16/honey rationale. S4 owns neutral-noon sky/key tokens; no compensatory LUT warmth. Keep four pinned anchors, issuer marks, risk ladder and DOM contrast. Explicitly scope supporting-pigment rule versus imported identity/DOM/practical and rare-event emission; operator resolves literal “only two” ambiguity.
**Amend:** palette chroma test rewritten to approved scope/ceiling; keep anchor/ordered-risk/contrast pins. Bible §§Atmosphere/Immutable colour anchors reconciled, not silently loosened.
**Budget:** +0 resources/JS. **Acceptance:** `npm test -- src/systems/palette.test.ts`; C1/C2/C5 plus dawn/golden/blue repetitions, grayscale separation and unchanged analytical identity.
**Depends:** P1, S4-P2 neutral daylight, `S9:destination`. **Risk/rollback:** muddy shade; revert supporting dyes, never move pinned anchors.

### S2-P6 · Replace terrain-specific finishes · M
**Files:** `src/three/garden-threshold.ts`; `src/three/garden-island.ts`; `src/three/garden-rim-mesh.ts`.
**Goal/change:** adopt role weights/atlas across near bank, crag/path and rim; preserve authored coverage and S7 wetness inputs. Delete replaced island moss/gravel texture generators; keep genuine geometric raking/data record geometry.
**Amend:** `docs/pharosville/VISUAL_INVARIANTS.md` §Hierarchy and emptiness texture prohibition; `src/three/garden-threshold.test.ts` deletes zero-Texture pin only (S1 owns shape/draw pins); `src/three/garden-island.test.ts`, `src/three/garden-rim-mesh.test.ts` assert roles/lifecycle, retain clearance/bounds.
**Budget:** +0 draws/tris; retire two maps, net S2 +1 texture (51 rest; nine below 60, 21 below 72); fallback net ≈15.97 MiB, compressed ≈3.97 MiB. +1–2 KiB JS estimated, before generator deletion savings.
**Acceptance:** `npm test -- src/three/garden-threshold.test.ts src/three/garden-island.test.ts src/three/garden-rim-mesh.test.ts`; C1–C6 show changed material read at rest, not merely a macro crop.
**Depends:** P1/P4/P5; `S9:invariant-rewrite`. **Risk/rollback:** over-detail; revert migration as one replacement, no layered old/new finish.

### S2-P7 · Architecture/fleet preparation and compatible merges · M
**Files:** `src/three/garden-harbor-batch.ts`; `src/three/garden-fleet-batch.ts`; `src/three/garden-ships.ts`; `src/three/garden-precinct.ts`; `src/three/garden-flora.ts`; `src/three/world-renderer.ts`.
**Goal/change:** distinguish timber/plaster/tile/stone buckets; canonical attribute normalization supplies missing UV/role defaults and preserves authored ones before merge. Apply timber recipe after fleet deformation; preserve wet-hull/age cues. Hero preparation preserves compatible shared maps/UVs rather than discarding them; split only materially incompatible buckets. Common tree prep covers lighthouse/precinct stone; flora keeps existing exemptions. S7 kit emits role-tagged geometry with grain-oriented UVs; no per-building asset/material stacks.
**Amend:** `docs/pharosville/ASSET_PIPELINE.md` §Checked models; `src/three/garden-harbor-batch.test.ts` rewrites exact 15-draw recipe if needed, retains batching/bounds; `src/three/garden-fleet-batch.test.ts`, `src/three/garden-ships.test.ts`, `src/three/garden-flora.test.ts`, `src/three/garden-print-inks.test.ts` add UV/map/exemption composition cases.
**Budget:** +0 tris/textures; target +0 calls, reserve ≤+2 colour calls only for necessary bucket separation (submitted shadow/reflection deltas measured separately); +2–4 KiB JS. Combined S2 estimates +0–2 calls/+0 tris/+1 texture and +28–57 KiB JS without KTX2.
**Acceptance:** `npm test -- src/three/garden-harbor-batch.test.ts src/three/garden-fleet-batch.test.ts src/three/garden-ships.test.ts src/three/garden-flora.test.ts src/three/garden-print-inks.test.ts`; C1/C2/C5/C6 plus selected USDC; no lost atlas/logo or material-resource growth.
**Depends:** P1/P4/P5; S7-P3 and S6 geometry can start independently, integration follows this packet. Release depends `S9:triangle-spike`/`S9:M5-calibration`.
**Risk/rollback:** incompatible attributes/call growth; retain original geometry while reverting the complete preparation path.

## Capture contract (requests, not exercised checks)
Run serially on existing preview server; C1 baseline/candidate identity must match. Repeat C1 at `t=7,18.5,19.2` with distinct filenames; repeat C5 with `#sel=ship.usdc-circle&t=12.25`.

```sh
# C1
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --width 1600 --height 1000 --seconds 20 --clean --blur-audit --draw-census --texture-census --assert --out s2/day.png --json s2/day.json
# C2
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=22' --width 1200 --height 640 --reduced --night-water --texture-census --assert --out s2/night-static.png --json s2/night-static.json
# C3
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --width 900 --height 720 --reduced --assert --out s2/gate-standard.png --json s2/gate-standard.json
# C4
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --width 1200 --height 640 --assert --out s2/gate-wide.png --json s2/gate-wide.json
# C5
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture dense --clock 2026-10-05 --hash '#cam=0,0,0.28&t=12.25' --width 1600 --height 1000 --texture-census --draw-census --assert --out s2/overview.png --json s2/overview.json
# C6
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --width 1600 --height 1000 --dpr 2 --still-camera --burst 9 --interval 600 --clip 0,650,1600,300 --burst-sheet --temporal --out s2/detail-drift.png --json s2/detail-drift.json
```

## Operator decisions required
1. **Material direction:** refined stylized PBR or complete print/NPR restyle? Recommend PBR with painterly value masses, no fullscreen imitation.
2. **Loader/bundle:** keep custom UV parser, or clean general-loader cutover with earned ≤1,024 KiB aggregate rebaseline? Recommend cutover; no allowance without candidate bytes/startup/M5 evidence. KTX2 earns a separate measured decision.
3. **Chroma scope:** literal only-two-exceptions across every emitted/data pixel, or C0.12 supporting pigments with explicit identity/DOM/practical/event scopes? Recommend scoped pigments, keeping the four anchors and avoiding accidental analytical recolouring; document exceptions rather than retaining 0.16 everywhere.

## Out of scope / do-not-do
No WebGPU, Draco, remote runtime assets/decoders, whole-world GLB, per-entity maps, blanket triplanar noise, baked sun, reflective moss, universal outlines or new post effects. Preserve same-origin `/api/*`, server-only `PHAROS_API_KEY`, sorted desktop size gate with unmounted world, DOM/ledger truth parity, non-colour/non-motion carriers, complete static reduced motion, one WebGL renderer and release only through `.github/workflows/release.yml`. S1/S6/S7 own silhouettes; S4 illumination; S9 operator lookdev and hardware calibration. No source/tests/builds/browser checks were run for this specification; only source reads and reference-file gzip counts.

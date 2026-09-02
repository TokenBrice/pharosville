# Wave 0 final-fix report

Date: 2026-09-02
Branch: `feat/grand-redesign-wave0-funding`

## Findings

### 1. Crane geometry now participates in whole-ring overview LOD

- Change: `authorDock` writes crane frame and fittings into dedicated `craneTimber` and `craneMetal` buckets. `createGardenHarborBatch` emits the real meshes as `dock-crane-timber` and `dock-crane-metal`; both names are registered in `OVERVIEW_LOD_DETAIL_NAMES` and `OVERVIEW_LOD_WHOLE_RING_NAMES`. The empty `dock-crane` compatibility group is gone.
- Covering tests: `garden-overview-lod.test.ts` asserts both real meshes contain geometry, are whole-ring registrations, hide below `OVERVIEW_LOD_HIDDEN_ZOOM`, and return at default zoom. `garden-harbor-batch.test.ts` continues to cap the nine-harbor batch at 20 drawables.
- Runtime evidence: the default census contains both one-call crane rows. The whole-map census contains neither crane row. The live harbor batch has 12 census rows, below the 20-row limit.

### 2. Asset-ready callback no longer allocates per frame

- Change: `createThreeWorldRenderer` creates `handleAssetReady` once beside `drawRecorder` and passes that stable function to every `updateSceneForFrame` call.
- Covering test: the focused `world-renderer` suite exercises normal, reduced-motion, refresh, and asset-ready frame plumbing.

### 3. Harbor fine-detail toggling no longer allocates arrays per frame

- Change: non-null fine-detail bucket and prop meshes are collected once when the harbor batch is created. `setFineDetailVisible` iterates that retained list.
- Covering test: `garden-harbor-batch.test.ts` toggles the entire fine-detail batch and checks every authored bucket and prop mesh.

### 4. Wake slot documentation matches current allocation

- Change: the `ShipVisual.wakeSlot` comment now states that `-1` is only the pre-assignment value; no transient or overflow ship is described as skipped.
- Covering checks: TypeScript and ESLint both pass.

### 5. Reduced-motion live-ship wakes are covered

- Change: `world-renderer.test.ts` now renders a moving live ship under reduced motion and makes one aggregate assertion that all seven matrices in its `fleet-wake-trails` slot have zero scale. The existing outsider assertion shares the same matrix-scale helper.
- Covering test: `collapses a live ship's batched wake trails under reduced motion`.

### 6. Harbor and wake disposal ownership is explicit and covered

- Change: harbor disposal now releases each `InstancedMesh`'s `instanceMatrix`, optional `instanceColor`, and geometry-attached instanced attributes before disposing the mesh. Wake disposal releases both owned instance-matrix buffers and both instanced meshes; its supplied geometry and material remain borrowed.
- Covering tests: the harbor disposal test spies on every merged/instanced geometry, owned material, and instance attribute, while proving the singleton chain-flag atlas texture is not disposed. The wake disposal test proves both instance buffers and meshes are disposed and its borrowed geometry/material are not.

## Verification

- `npm test -- src/three/garden-harbor-batch src/three/garden-wake-batch src/three/garden-overview-lod src/three/garden-ships src/three/world-renderer` — PASS, 5 files / 89 tests.
- `npm test -- src/three/garden-docks.test.ts` — PASS, 1 file / 19 tests (adjacent crane-authoring contract).
- `npm run typecheck` — PASS, 0 errors.
- `npm run lint` — PASS, 0 warnings/errors.
- `env -u CI npm run preview -- --url http://localhost:5173 --draw-census --assert` — PASS on Apple M5 Pro / ANGLE Metal: full tier, 60 fps, p90 16.7 ms, worst p95 16.8 ms, 250 recurring calls, 343,753 triangles, 260 geometries, 71 textures; census reconciled 250/250.
- `env -u CI npm run preview -- --url http://localhost:5173 --hash "#cam=0,0,0.28" --draw-census --out w0-finalfix-wholemap.png` — PASS capture: full tier, 60 fps, p90 16.7 ms, 246 recurring calls, census reconciled 244/244 scene calls. No `dock-crane-*` row is present.

## Outputs

- New whole-map capture: `outputs/w0-finalfix-wholemap.png`.
- Comparison baseline: `outputs/w0-final-wholemap.png`.
- Visual comparison: matching 1600×1000 framing, palette, fog/water treatment, island/harbor placement, labels, and overall composition. Individual ship poses differ because both are normal-motion live captures.

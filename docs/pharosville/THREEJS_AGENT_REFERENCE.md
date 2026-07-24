# Three.js Agent Reference

Last updated: 2026-07-24

Agent-facing reference for the PharosVille Three.js stack: framework
fundamentals that matter when writing code, how this repo uses them, and the
rules agents must not violate.

Read this when changing `src/three/`, `src/renderer/`, the world render loop,
hit testing, post-processing, GLBs, or any GPU/visual path. Pair it with
`ARCHITECTURE.md`, `HOOKS.md`, `MOTION_POLICY.md`, `ASSET_PIPELINE.md`, and
`KNOWN_PITFALLS.md` for product boundaries.

## 1. Stack Decision

| Fact | Value |
| --- | --- |
| Package | `three@0.185.1` with matching `@types/three` |
| Style | **Vanilla / imperative** Three.js |
| React binding | Canvas `ref` + dynamic import; **not** React Three Fiber |
| Production renderers | Exactly one: WebGL via `createThreeWorldRenderer` |
| Failure path | Hide canvas → DOM `WorldStaticOverview` (no Canvas 2D) |
| Models | `GLTFLoader` for budgeted same-origin GLBs |
| Most scenery | Procedural geometry and materials in `src/three/garden-*.ts` |

Do **not** introduce React Three Fiber, drei, a second drawing backend, or a
renderer selection flag unless the operator explicitly redesigns the boundary.

## 2. Three.js Mental Model For Agents

Three.js is a scene-graph and WebGL helper library. It does not own React
state, analytics meaning, or accessibility. Treat it as a GPU presentation
layer fed by immutable world data.

### 2.1 Core objects

| Concept | Role in PharosVille |
| --- | --- |
| `Scene` | Root graph (`garden-scene` content hangs under it) |
| `OrthographicCamera` | Iso-style observatory view, rebuilt from `IsoCamera` each frame |
| `WebGLRenderer` | Draws into the host HTML canvas; owns GPU context |
| `Object3D` / `Group` / `Mesh` | Hierarchy nodes; transform via position/rotation/scale |
| `BufferGeometry` | Vertex data on GPU; share aggressively |
| `Material` | How surfaces shade; share when safe |
| `Texture` / `CanvasTexture` / `DataTexture` | GPU image data; dispose when replaced |
| `InstancedMesh` | Many identical meshes in few draw calls |
| `ShaderMaterial` | Custom GLSL (water, beam, grade) |
| Addons (`three/examples/jsm/...`) | `GLTFLoader`, `EffectComposer`, bloom, output pass |

### 2.2 Coordinate and unit conventions

Three.js treats **1 unit ≈ 1 meter**. This app maps the 2D tile world into 3D:

- Tile → world XZ: `position.set(tile.x * TILE_SCALE, height, tile.y * TILE_SCALE)`
- `TILE_SCALE = Math.SQRT2` (`garden-util.ts`)
- Y is up; water sits at `GARDEN_WATER_Y`
- Camera sits on an orthographic rig at fixed distance `CAMERA_DISTANCE = 110`
  and looks at the pan/zoom center from the iso-style display camera
- Hit testing projects the **same** display tiles and motion samples into
  screen rects; it does **not** raycast the GPU mesh for selection truth

### 2.3 Color and tone

Modern Three (this pin) uses:

- `renderer.outputColorSpace = SRGBColorSpace`
- `renderer.toneMapping = AgXToneMapping`
- When the post composer is active, `OutputPass` owns tone mapping / color
  space conversion for the final blit

Color maps and logo canvas textures should use sRGB; data maps (normals, packed
lane textures) stay linear. Prefer `HARBOR_PALETTE` and systems zone themes over
ad-hoc hex colors.

### 2.4 What Three does not garbage-collect for you

WebGL resources are **not** fully reclaimed by dropping a JS reference. Agents
must dispose:

| Resource | Call |
| --- | --- |
| Geometry | `geometry.dispose()` |
| Material | `material.dispose()` |
| Texture | `texture.dispose()` |
| InstancedMesh | `instancedMesh.dispose()` (instance buffers) |
| EffectComposer / passes | `composer.dispose()` / `pass.dispose()` |
| WebGLRenderer | `renderer.renderLists.dispose()` then `renderer.dispose()` |

Canonical helper: `disposeThreeObjectTree(root)` in `garden-util.ts`. It
traverses once, de-dupes shared resources with `Set`, and disposes each
geometry, material, texture, and `InstancedMesh` exactly once.

Prefer **hiding** (`visible = false`, `intensity = 0`) over destroy/recreate for
transient UI. Prefer **replace world content** only when the immutable
`PharosVilleWorld` or transient selected outsider ship actually changes.

### 2.5 Render-loop discipline

Three.js apps usually run:

```text
requestAnimationFrame → mutate scene → renderer.render(scene, camera)
```

PharosVille rules:

1. **One** route-owned RAF in `useWorldRenderLoop` for normal motion.
2. Reduced motion: `timeSeconds = 0`, on-demand paint, **no** continuous RAF.
3. Do **not** allocate geometries, materials, or textures every frame.
4. Reuse scratch math objects (`Matrix4`, `Vector3`) at module scope.
5. Mutate Three objects in the frame path; do not `setState` every frame.
6. Never invent a second RAF or per-entity `setInterval` for motion.

### 2.6 Performance levers that matter here

| Lever | Guidance |
| --- | --- |
| Draw calls | Batch and instance (gulls, fireflies, lanterns, shadows, shoreline) |
| Lights | Few direct lights; do not add/remove lights at runtime (shader recompile) |
| Shadows | Keep shadow support compiled; change cost via `mapSize` / `intensity` |
| Materials | Share when possible; clone only when instance tint/state must diverge |
| Textures | Small, power-of-two when practical; dispose replaced maps |
| DPR | Cap ≤ 2 in Three; also bounded by the shared backing-pixel governor |
| Transparency | Expensive; keep overlays sparse |
| Post | Each pass costs a full-screen draw; tiered on/off in this app |
| Frustum | Keep orthographic/shadow frusta tight to the island |

### 2.7 Common agent failure modes (generic Three)

1. Creating objects inside the render loop → GC + GPU upload stalls.
2. Forgetting dispose on replace → memory/GPU leaks across world refreshes.
3. Double-disposing shared cached geometry (especially GLB clones).
4. Toggling lights or `castShadow` every frame → material recompiles.
5. Raycasting dense meshes every pointer move when a screen-space index exists.
6. Importing the Three chunk on mobile/portrait paths.
7. Encoding meaning only in color or mesh visibility with no DOM parity.
8. Assuming R3F auto-dispose semantics in a vanilla lifecycle.

## 3. PharosVille Architecture Map

```text
Viewport gate (client.tsx)
  capable landscape only
        |
        v
systems/  → immutable PharosVilleWorld + motion plan
        |
        v
pharosville-world.tsx
  canvas ref (data-renderer="three")
  useCanvasResizeAndCamera   → size, IsoCamera, gestures
  useShipLogoAssets          → logos only (ThreeLogoAssets)
  useWorldRenderLoop         → dynamic import + single clock
        |
        +-- src/three/world-renderer.ts   GPU scene
        +-- src/renderer/*                contracts, scheduler, hit tests
        |
   fail → WorldStaticOverview (DOM)
```

### 3.1 Ownership split

| Layer | Owns | Does not own |
| --- | --- | --- |
| `src/systems/` | Analytics, layout, routes, motion samples, palette themes | Drawing, WebGL |
| `src/renderer/` | Frame contract, scheduler tiers, hit targets | Scene graph |
| `src/three/` | Scene, camera, lights, water, ships, models, post, dispose | Market semantics |
| Hooks | RAF, dynamic import, DPR governor, failure transition | Scene construction |

### 3.2 Public renderer contract

Source of truth: `src/renderer/world-renderer-backend.ts`.

```ts
interface ThreeWorldRenderer {
  dispose(): void;
  render(frame: ThreeWorldRendererFrame): ThreeWorldRendererMetrics;
}

// Factory
createThreeWorldRenderer({
  canvas,
  onAssetReady?,      // request repaint after async GLB/logo work
  onContextFailure,   // context lost / creation error → DOM fallback
}): ThreeWorldRenderer
```

Frame fields the GPU path consumes:

| Field | Consumer notes |
| --- | --- |
| `world` | Rebuild content when reference / transient outsider changes |
| `camera` | Drive orthographic pan/zoom |
| `width` / `height` / `dpr` | `setSize` / `setPixelRatio` (DPR capped at 2) |
| `timeSeconds` | Water, bob, day motion; forced 0 under reduced motion |
| `wallClockHour` | Day/dusk/night grade and sky |
| `shipMotionSamples` | Ship pose/heading; must match hit testing |
| `motionPlan` / `seaState` | Route and water tempo |
| `selectedDetailId` / `hoveredDetailId` | Markers and emphasis |
| `assets` | Logo images + generation key for sail textures |
| `renderScheduler` | Tier-driven quality shedding |
| `reducedMotion` | Freeze decorative animation |

## 4. Module Map (`src/three/`)

| Module | Responsibility |
| --- | --- |
| `world-renderer.ts` | Factory, scene shell, world replace, per-frame update, metrics |
| `garden-util.ts` | Tile math, ship geometry cache helpers, `disposeThreeObjectTree` |
| `garden-models.ts` | GLB manifest, loader library, anchors, budgets, validation |
| `garden-lighthouse.ts` | Procedural three-tier Pharos shell + beam/ray fan; attach GLB shell |
| `garden-beacon-fire.ts` | Brazier flame, embers, smoke, mirror glint (shared `uTime`/`uFlicker`/`uIntensity`) |
| `garden-summit-birds.ts` | Eight-bird instanced summit flock orbiting the Pharos crown |
| `garden-ships.ts` | Procedural hulls, wakes, hero GLB attach, sail sync, fleet lanterns |
| `garden-sail-texture.ts` | 128² in-memory sail `CanvasTexture` |
| `garden-water.ts` | Full-bleed water shader + normal map + lane/zone uniforms |
| `garden-lanterns.ts` | Packed warm-light lane `DataTexture` (max 48, tier-capped) |
| `garden-island.ts` | Terraced island, accents, decoration |
| `garden-docks.ts` | Chain docks + harbor lanterns |
| `garden-landmarks.ts` | Cemetery + TON pigeonnier |
| `garden-zones.ts` | Analytical water zones, buoys, danger weather |
| `garden-harbor-life.ts` | Districts, causeways, gulls, fireflies |
| `garden-sky.ts` | Dome, stars, moon, mist, fog |
| `garden-day-cycle.ts` | Wall-clock phase blending |
| `garden-post.ts` | EffectComposer: render → bloom → grade/vignette → output |

`src/renderer/`:

| Module | Responsibility |
| --- | --- |
| `world-renderer-backend.ts` | Lifecycle + frame types |
| `render-types.ts` | Metrics and scheduler tier types |
| `render-scheduler.ts` | Hysteresis tiers under load / interaction / reduced motion |
| `hit-testing.ts` | Spatial index over screen rects |
| `garden-observatory-hit-testing.ts` | Build hit rects from world + motion samples |

The old renderer layers directory of empty historical placeholders has been
deleted; it was never a live layer stack. Do not resurrect a multi-backend
layer architecture.

## 5. Lifecycle Recipes

### 5.1 Mount

1. Desktop gate passes → lazy desktop data mounts.
2. `useWorldRenderLoop` dynamically imports `src/three/world-renderer.ts`.
3. `createThreeWorldRenderer` builds scene, lights, water, sky, post, listeners.
4. Async: lighthouse GLB clone; optional hero hull clones per ship.
5. Status becomes `ready`; first coherent frame paints.

### 5.2 Per frame (normal motion)

```text
RAF
  → sample ships (shared samples)
  → step camera
  → rebuild hit-target snapshot
  → resolve scheduler tier
  → three.render(frame)
       replaceWorldContent if needed
       sync sail textures if logo generation changed
       update day cycle, sky, water, ships, markers, shadows
       post.render() or direct path by tier
  → adaptive DPR + metrics
```

### 5.3 World content replace

When `frame.world` changes or the transient selected outsider ship changes:

1. Detach lighthouse model from content (keep library-owned model if needed).
2. Remove content root from scene.
3. `disposeThreeObjectTree(content.root)`.
4. Build new content group (island, docks, ships, zones, landmarks, cues).
5. Re-attach lighthouse model / anchors.
6. Kick hero GLB loads for the new content generation.

### 5.4 Async asset rules

| Asset | Rule |
| --- | --- |
| Lighthouse GLB | Procedural shell first; GLB swaps in; failure keeps shell |
| Hero hull GLB | Procedural hull first; clone materials for tint; geometry stays shared with cache |
| Stale clone after world swap | Drop attach; **do not dispose** shared cached geometry |
| Dispose after unmount | If `disposed`, dispose orphaned non-shared trees safely |
| Logos | React `ThreeLogoAssetStore` only; sails refresh on generation key |

### 5.5 Teardown

`dispose()` must be idempotent:

1. Remove context-lost listeners.
2. `post.dispose()`, lane registry dispose.
3. `disposeThreeObjectTree(scene.root)` (+ detached model if needed).
4. `modelLibrary.clear()`.
5. `renderer.renderLists.dispose()` + `renderer.dispose()`.
6. Further `render()` throws.

StrictMode double-mount is covered by unit tests: late async completion after
dispose must not attach into a dead renderer.

### 5.6 Failure

Context lost, context creation error, module import failure, or render throw:

1. Dispose Three resources.
2. `rendererStatus = "failed"`.
3. Hide WebGL canvas.
4. Show interactive `WorldStaticOverview`.
5. Keep detail panel and accessibility ledger.

There is **no** automatic WebGL retry loop and no second graphical renderer.

## 6. Scheduler Tier Matrix

Source: `render-scheduler.ts` + consumers in `world-renderer` / garden modules.

| Tier | When | Typical shedding |
| --- | --- | --- |
| `full` | Reduced motion (deterministic quality) | Full detail, still static time |
| `balanced` | Healthy load | Default quality |
| `interaction` | Camera pan/zoom intent | Prefer responsiveness |
| `recovery` | Elevated frame/draw cost | Drop bloom; reduce decorative work |
| `constrained` | Severe cost | Composer off; heavy ambient/shadow cuts |

Concrete levers already wired:

- Shadow map size / intensity (support stays enabled to avoid recompiles)
- Composer enable (off when `constrained`)
- Bloom enable (off when `recovery` or composer off)
- Light-lane cap (48 → much lower under pressure)
- Water detail / decorative life visibility
- Semantic overview vs explore fine geometry (`gardenSemanticView`)
- Beacon fire and fan shedding (full → balanced → interaction → recovery/
  constrained): beam cone + outer cone + ray fan + dust + embers(32) +
  smoke(16) + flame + summit birds → cone + fan + embers(12) + smoke(8) +
  flame + birds → cone + flame → flat beam plane + flame. Embers/smoke shed
  via draw-range and instance-count (never reallocated); ray fan and summit
  birds are full/balanced only; water foam rings shed below balanced.

Analytical selection, DOM labels, and ledger truth must remain available even
when decorative passes shed.

## 7. Interaction And Accessibility

- Pointer hover/select uses **screen-space hit targets**, not mesh raycasts.
- Keyboard traversal and detail panel must work without reading pixels.
- Area labels and Observe captions are **DOM overlays**, not baked into WebGL.
- Selection/hover markers are Three meshes, but meaning always has DOM parity.
- Follow-selected and hit rects use the same motion samples as drawing.

When changing ship pose, display tiles, or zoom mapping, update:

1. `src/three/` presentation
2. `garden-observatory-hit-testing.ts`
3. follow-selected / camera helpers if they consume the same transforms
4. unit tests for both render and hit layers

## 8. Media Rules

| Runtime media | Path |
| --- | --- |
| Stablecoin logos | Same-origin images → sail `CanvasTexture` |
| Lighthouse / hero models | Same-origin GLB via `garden-models.ts` |
| Water normals | Same-origin texture URL with content hash query |
| Island, docks, fleet, cemetery, water body | Procedural in renderer code |

Not runtime:

- Deleted Canvas-era raster inventories
- Generated concept images until deliberately translated
- Remote generation URLs or tokens

Model checklist (also in `ASSET_PIPELINE.md`):

1. Deterministic generator under `scripts/pharosville/`.
2. Manifest entry: URL, sha256, dimensions, origin, anchors, pick proxy, budgets.
3. Procedural or prior visual fallback on load failure.
4. `npm run check:garden-models` and focused three tests.

## 9. Agent Change Recipes

### 9.1 Adjust lighting or day cycle

- Edit `garden-day-cycle.ts` / light setup in `world-renderer.ts` / `garden-sky.ts`.
- Prefer intensity and color blends over adding new light objects.
- Keep shadow support compiled; retune via map size / intensity / frustum.
- Validate with visual + perf lanes if exposure or night bloom changes.

### 9.2 Change water look

- Shader and uniforms live in `garden-water.ts`.
- Lane reflections come from `garden-lanterns.ts` packed texture.
- Zone tints are capped (`MAX_GARDEN_WATER_ZONES`).
- Do not solve composition issues by adding post passes first.

### 9.3 Add or edit a procedural landmark

1. Prefer a dedicated `garden-*.ts` factory returning a group + dispose-friendly
   resources.
2. Mount from world content creation in `world-renderer.ts`.
3. Register selection/hover cues if the landmark is interactive.
4. Mirror hit targets if pointer/keyboard must reach it.
5. Keep analytical meaning in systems + DOM details.
6. Add unit tests; run visual if silhouette/composition changes.

### 9.4 Change ships

- Silhouette/livery/wake: `garden-ships.ts` + systems ship visuals.
- Sail logos: `garden-sail-texture.ts` + asset pipeline (logo-only).
- Hero hulls: generator + `garden-models.ts` + `attachGardenHeroModel`.
- Never leave a blank sail when a logo fails; keep symbol fallback.

### 9.5 Add a warm light that reflects on water

1. Compute world position.
2. Register a lane through `GardenLaneRegistry` (respect tier caps).
3. Do not add unbounded real-time `PointLight`s for every lamp.
4. Ensure dispose path clears registry-owned textures.

### 9.6 Performance work

1. Measure with existing metrics (`renderer.info`, scheduler tier, perf tests).
2. Prefer instancing, shared geometry, lower shadow map, tier shedding.
3. Do not weaken budgets for cosmetics without an explicit decision.
4. After bundle-affecting imports: `npm run build && npm run check:bundle-size`.

### 9.7 Tune the beacon fire or add a flame-adjacent effect

1. Follow the `garden-beacon-fire.ts` pattern: one shared uniforms object
   (`uTime`/`uFlicker`/`uIntensity`) drives every element so the fire breathes
   together; `uFlicker` is a deterministic function of `timeSeconds`.
2. Particles are GPU-age driven from seed attributes (like the beam dust) —
   zero per-frame allocation, no `Math.random`.
3. Shed per scheduler tier via draw-range / instance-count, never reallocate.
4. Find scene nodes by name (`lighthouse-beacon`, `lighthouse-ray-fan`, …)
   rather than child indices.
5. Reduced motion is a composed t=0 pose, not a hidden node — freeze `uTime`,
   keep the frame.

## 10. Testing Strategy

| Layer | Command / focus |
| --- | --- |
| Unit three | `npm test -- src/three` |
| Unit renderer contracts | `npm test -- src/renderer` |
| Models | `npm run check:garden-models` |
| Viewport import boundary | `npm run check:viewport-gate` |
| Browser visual | `npm run test:visual` |
| GPU / pacing | `npm run test:perf` |
| Mixed | `npm run validate:changed` |

Notes:

- Many three unit tests mock `WebGLRenderer` and assert dispose, child order,
  and tier behavior without a real GPU.
- Scene child order in `createGardenScene` is intentionally stable for tests;
  do not reshuffle lights/water/sky casually.
- Visual baselines are evidence, not a license to ignore unit contracts.
- Software/integrated GPU numbers are not the strict reference machine gate.

## 11. Hard Rules (do not violate)

From product invariants and this stack:

1. One production Three.js renderer; no Canvas 2D recovery backend.
2. No Three import, GLB fetch, or logo decode below the desktop gate / portrait.
3. No second RAF or per-entity motion timers.
4. Rendering, hit testing, follow-selected, and debug share motion samples.
5. Analytical meaning always has DOM / ledger parity.
6. Dispose replaced world content; do not allocate GPU resources every frame.
7. Do not hand-edit production GLBs; use generators + metadata.
8. Do not dispose shared model-cache geometry belonging to live clones.
9. Runtime media is only the checked model manifest, water texture, and
   top-level stablecoin-logo inventory.
10. Do not reintroduce R3F or a multi-renderer switch without an explicit redesign.
11. Do not encode transfer/bridge/issuer-operation claims into routes or wakes.
12. Keep `PHAROS_API_KEY` server-side; browser uses same-origin `/api/*` only.

## 12. External References

Use these when implementing unfamiliar Three APIs. Prefer current docs for the
pinned major line; this repo is on **r185**.

- Official docs index: https://threejs.org/docs/
- Manual (fundamentals): https://threejs.org/manual/
- How to dispose of objects: https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
- How to update things: https://threejs.org/docs/#manual/en/introduction/How-to-update-things
- Discover three.js tips: https://discoverthreejs.com/tips-and-tricks/
- glTF is the web delivery format of choice for models (this app uses GLB)
- R3F performance pitfalls (concepts still useful; **do not adopt R3F here**):
  https://r3f.docs.pmnd.rs/advanced/pitfalls

API surfaces most often touched in this repo:

- `WebGLRenderer`, `OrthographicCamera`, `Scene`
- `MeshStandardMaterial`, `MeshBasicMaterial`, `ShaderMaterial`, `LineBasicMaterial`
- `InstancedMesh`, `Group`, `Object3D`
- `CanvasTexture`, `DataTexture`, `TextureLoader`
- `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js`
- Post: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `ShaderPass`, `OutputPass`

## 13. Quick Orientation Checklist

Before editing Three code:

1. Confirm the task belongs in `src/three/` vs pure `systems/` semantics.
2. Read this file plus `HOOKS.md` if touching the RAF/lifecycle boundary.
3. Identify whether the change is frame mutation, world rebuild, async asset,
   hit-test parity, or post/tier policy.
4. Plan dispose paths and shared-resource ownership.
5. Choose the smallest validation lane from section 10.
6. Keep desktop gate, DOM fallback, and ledger parity intact.

## 14. Related Docs

| Doc | Why |
| --- | --- |
| `ARCHITECTURE.md` | End-to-end app model |
| `docs/pharosville-page.md` | Route contract |
| `HOOKS.md` | RAF / asset / camera boundaries |
| `MOTION_POLICY.md` | Single clock and effect caps |
| `ASSET_PIPELINE.md` | Logos and models |
| `VISUAL_INVARIANTS.md` | Non-negotiable visual contracts |
| `KNOWN_PITFALLS.md` | Repeat-risk mistakes |
| `TESTING.md` | Validation lanes |
| `RUNTIME_FACTS.md` | Generated budgets and inventories |
| `src/renderer/README.md` | Engine-neutral boundary summary |
| `src/systems/README.md` | Semantics stay pure |

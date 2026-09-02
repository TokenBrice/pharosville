# Wave 0 — Draw-Call Funding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclaim ≥250 recurring draw calls from the default framing (693 → ≤450) with a pixel-equivalent frame, and leave behind a per-owner draw-call census so every later wave's geometry budget is measured, not estimated.

**Architecture:** Three moves. (1) A renderer-local **draw-owner census** mirroring the existing `textureOwnerCensus`, exposed through `PharosVilleRenderMetrics` and printed by `preview.mjs --draw-census`. (2) A **global harbor batch** (`garden-harbor-batch.ts`): every dock's static geometry lands in world-wide per-material-bucket merged meshes with vertex colours, every repeated prop in one world-wide `InstancedMesh` per prop kind; per-dock `Group` roots persist as empty anchors exactly as batched ship roots already do. This is the infrastructure Wave 3's shore stations will author into. (3) **Island and hero residue merges** for whatever the census shows still costs a call per part.

**Tech Stack:** three r185 (`InstancedMesh`, `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils`, `MeshStandardMaterial` with `vertexColors`), Vitest, `scripts/pharosville/preview.mjs` on the real GPU.

**Spec:** `agents/2026-09-02-grand-redesign-evaluation-and-plan.md` §6 (funding table) and §7 Wave 0.

## Global Constraints

- Ceilings: ≤700 draw calls, ≤500 geometries, ≤72 textures, ≤500k triangles, p90 ≤20 ms and p95 ≤20 ms at tier `full` (`docs/pharosville/TESTING.md`). Wave 0 lowers calls; it may not raise any other ceiling.
- Look and frame time are judged ONLY via `npm run preview` (real GPU). Never through a Playwright browser.
- Pixel-equivalence gate for every geometry task: `npm run preview -- --out <name>.png` at `#t=12`, `#t=19`, `#t=22&n=1`, `#cam=0,0,0.28`; the before/after pair must be indistinguishable by eye at 100 % and the census must show the expected owner deltas. No LUT, grade, fog or palette constant changes in this wave.
- Hit testing is screen-rect based (`src/renderer/hit-testing.ts`); no raycasting exists. Merged geometry loses no interaction — but every cue anchor (`part.cues`), lane registration, tide face, cargo-tide slot and shadow flag that today reads a per-dock `root` must keep reading a per-dock anchor `Group`.
- Reduced motion, hidden-tab pause, per-part rebuild (`rebuildWorldContentPart`) and dock accent transitions (`stageDockAccentTransitions`) must keep working unchanged in behaviour.
- Docs that must be updated in the same commit as the code they describe: `docs/pharosville/THREEJS_AGENT_REFERENCE.md` (batching pattern), `docs/pharosville/TESTING.md` (`--draw-census`), `docs/pharosville/RUNTIME_FACTS.md` via `npm run docs:runtime-facts` if any generated fact changes.
- One slice, one commit, one review. No formatter/lint/full-suite runs mid-task; run `npm run validate:changed` once at the end of the wave.

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `src/three/world-renderer.ts` | census hook into metrics (near `textureOwnerCensus`, lines 635–696, 1248–1312); `buildDocksPart` (3043–3075) switches to the harbor batch; island part merge call | modify |
| `src/three/garden-draw-census.ts` | pure `drawOwnerCensus(root, renderer.info)` + `DrawOwnerCensus` type | create |
| `src/three/garden-draw-census.test.ts` | census unit tests | create |
| `src/renderer/render-types.ts` | `PharosVilleRenderMetrics.drawOwnerCensus` | modify |
| `scripts/pharosville/preview.mjs` | `--draw-census` flag and printer (mirror `printTextureOwnerCensus`, 1208–1219) | modify |
| `src/three/garden-harbor-batch.ts` | `createGardenHarborBatch(docks)`: global material buckets + global instanced props + per-dock anchors + accent recolour API | create |
| `src/three/garden-harbor-batch.test.ts` | batch contract tests | create |
| `src/three/garden-docks.ts` | `createDock` → `authorDock` returns geometry/prop **recipes** instead of meshes (buckets, prop instances, lamp positions, tide face, cargo lanes, flag spec) | modify |
| `src/three/garden-docks.test.ts` | budget test rewritten to the recipe contract | modify |
| `src/three/garden-island.ts` | `mergeIslandStatics(root)` post-pass | modify |
| `src/three/garden-ships.ts` | hero residue merge (only if the census shows >2 recurring draws per hero) | modify (conditional) |
| `docs/pharosville/THREEJS_AGENT_REFERENCE.md`, `docs/pharosville/TESTING.md` | document census and harbor batch | modify |

---

### Task 1: Draw-owner census (measured, not estimated)

**Files:**
- Create: `src/three/garden-draw-census.ts`
- Create: `src/three/garden-draw-census.test.ts`
- Modify: `src/renderer/render-types.ts` (metrics type)
- Modify: `src/three/world-renderer.ts` — renderer construction (≈698–706), the frame `render` call site, metrics assembly (1248–1312); reuse `textureOwnerName` at 635
- Modify: `scripts/pharosville/preview.mjs:60,386-391,1196-1219`
- Modify: `docs/pharosville/TESTING.md` (perf section)

**Design.** three assigns `renderBufferDirect` on the renderer INSTANCE in its constructor (not the prototype), and calls it once per actual draw with the real `object`, `geometry`, `material`, `group`. Wrapping the created instance for exactly one sampled frame yields the true per-owner attribution, and its sum MUST equal `renderer.info.render.calls` for that same frame — the reconciliation is an assertion, not a report. A scene-traversal count is NOT this census; it is an eligibility estimate and is not built in this wave.

**Interfaces:**
- Produces:
  ```ts
  export interface DrawOwnerCensusEntry { owner: string; calls: number; triangles: number; instanced: boolean }
  export interface DrawOwnerCensus {
    owners: DrawOwnerCensusEntry[];   // sorted by calls desc, then owner asc
    attributedCalls: number;          // sum of entry.calls — MUST equal rendererCalls
    rendererCalls: number;            // renderer.info.render.calls measured on the sampled frame
    sampledAtFrame: number;           // frame counter when sampled
  }
  /** Minimal structural type so the recorder is testable without a WebGL context. */
  export interface DrawRecorderTarget {
    renderBufferDirect: (camera: Camera, scene: Scene | null, geometry: BufferGeometry, material: Material, object: Object3D, group: { start: number; count: number } | null) => void;
    info: { render: { calls: number } };
  }
  export interface DrawOwnerRecorder {
    /** Arms the wrapper for the NEXT `render` call; the wrapper self-removes when `finish()` runs. */
    arm(): void;
    /** Called right after the sampled frame's `render`; returns the census or null if not armed. */
    finish(frame: number): DrawOwnerCensus | null;
  }
  export function createDrawOwnerRecorder(target: DrawRecorderTarget, root: Object3D, ownerDepth?: number): DrawOwnerRecorder
  ```
- Owner naming: nearest named ancestors of `object`, up to `root`, joined `/`, depth 2 (e.g. `docks/dock-warehouses`, `ships/hero-tether`). Unnamed → `object.type`.
- Triangles per call: `group ? group.count/3 : (geometry.index?.count ?? position.count)/3`, × `object.count` for `InstancedMesh`. Shadow-map passes and the composer's full-screen quads go through the same `renderBufferDirect`, so they are attributed too (as `shadow/…` when `camera.isOrthographicCamera && scene === shadowScene` is not distinguishable — attribute by the object's owner path; a full-screen `Mesh` with no named ancestor lands as `Mesh`). The reconciliation therefore holds by construction: every counted draw is a real draw.

- [ ] **Step 1: Write the failing test**

```ts
// src/three/garden-draw-census.test.ts
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, OrthographicCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createDrawOwnerRecorder, type DrawRecorderTarget } from "./garden-draw-census";

function box(name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

/** A renderer stand-in that "draws" a list of objects through renderBufferDirect and counts them in info. */
function fakeRenderer(draws: Array<{ object: Mesh | InstancedMesh; group?: { start: number; count: number } }>): DrawRecorderTarget & { render(): void } {
  const target: DrawRecorderTarget & { render(): void } = {
    info: { render: { calls: 0 } },
    renderBufferDirect() { target.info.render.calls += 1; },
    render() {
      target.info.render.calls = 0;
      const camera = new OrthographicCamera();
      for (const draw of draws) {
        const material = Array.isArray(draw.object.material) ? draw.object.material[0] : draw.object.material;
        target.renderBufferDirect(camera, null, draw.object.geometry, material, draw.object, draw.group ?? null);
      }
    },
  };
  return target;
}

describe("createDrawOwnerRecorder", () => {
  it("attributes every real draw to its nearest named ancestors and reconciles exactly to info.render.calls", () => {
    const scene = new Scene();
    const content = new Group(); content.name = "content";
    const docks = new Group(); docks.name = "docks";
    const deckA = box("dock-deck"), deckB = box("dock-deck"), quay = box("dock-quay-wall");
    const culled = box("dock-crane");                       // in the scene, NOT drawn — must not appear
    docks.add(deckA, deckB, quay, culled); content.add(docks); scene.add(content);
    const renderer = fakeRenderer([{ object: deckA }, { object: deckB }, { object: quay }]);
    const recorder = createDrawOwnerRecorder(renderer, scene);
    recorder.arm();
    renderer.render();
    const census = recorder.finish(7)!;
    expect(census.rendererCalls).toBe(3);
    expect(census.attributedCalls).toBe(3);
    expect(census.sampledAtFrame).toBe(7);
    expect(census.owners).toEqual([
      { owner: "docks/dock-deck", calls: 2, triangles: 24, instanced: false },
      { owner: "docks/dock-quay-wall", calls: 1, triangles: 12, instanced: false },
    ]);
  });

  it("counts an InstancedMesh as one call with count-many triangles and a multi-material group per group draw", () => {
    const scene = new Scene();
    const props = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 40); props.name = "dock-posts";
    const terrace = new Mesh(new BoxGeometry(), [new MeshStandardMaterial(), new MeshStandardMaterial()]); terrace.name = "island-terrace";
    scene.add(props, terrace);
    const renderer = fakeRenderer([
      { object: props },
      { object: terrace, group: { start: 0, count: 18 } },
      { object: terrace, group: { start: 18, count: 18 } },
    ]);
    const recorder = createDrawOwnerRecorder(renderer, scene);
    recorder.arm(); renderer.render();
    const census = recorder.finish(1)!;
    expect(census.attributedCalls).toBe(census.rendererCalls);
    expect(census.owners).toEqual([
      { owner: "island-terrace", calls: 2, triangles: 12, instanced: false },
      { owner: "dock-posts", calls: 1, triangles: 480, instanced: true },
    ]);
  });

  it("restores the original renderBufferDirect after one sampled frame and returns null when not armed", () => {
    const scene = new Scene();
    const mesh = box("x"); scene.add(mesh);
    const renderer = fakeRenderer([{ object: mesh }]);
    const original = renderer.renderBufferDirect;
    const recorder = createDrawOwnerRecorder(renderer, scene);
    expect(recorder.finish(0)).toBeNull();
    recorder.arm(); renderer.render(); recorder.finish(1);
    expect(renderer.renderBufferDirect).toBe(original);
    renderer.render();                                  // second frame is not recorded
    expect(recorder.finish(2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/three/garden-draw-census`
Expected: FAIL — `Cannot find module './garden-draw-census'`.

- [ ] **Step 3: Implement the recorder**

```ts
// src/three/garden-draw-census.ts
import type { BufferGeometry, Camera, InstancedMesh, Material, Object3D, Scene } from "three";

export interface DrawOwnerCensusEntry { owner: string; calls: number; triangles: number; instanced: boolean }
export interface DrawOwnerCensus { owners: DrawOwnerCensusEntry[]; attributedCalls: number; rendererCalls: number; sampledAtFrame: number }
export interface DrawRecorderTarget {
  renderBufferDirect: (camera: Camera, scene: Scene | null, geometry: BufferGeometry, material: Material, object: Object3D, group: { start: number; count: number } | null) => void;
  info: { render: { calls: number } };
}
export interface DrawOwnerRecorder { arm(): void; finish(frame: number): DrawOwnerCensus | null }

function ownerName(object: Object3D, root: Object3D, depth: number): string {
  const names: string[] = [];
  let current: Object3D | null = object;
  while (current && current !== root && names.length < depth) {
    if (current.name) names.push(current.name);
    current = current.parent;
  }
  return names.length ? names.reverse().join("/") : object.type;
}

/**
 * Wraps the renderer INSTANCE's `renderBufferDirect` (three assigns it per instance in the
 * constructor) for exactly one armed frame, so every counted draw is a draw that happened.
 * `attributedCalls === rendererCalls` is therefore a reconciliation the caller may assert.
 */
export function createDrawOwnerRecorder(target: DrawRecorderTarget, root: Object3D, ownerDepth = 2): DrawOwnerRecorder {
  let armed = false;
  let original: DrawRecorderTarget["renderBufferDirect"] | null = null;
  let byOwner = new Map<string, DrawOwnerCensusEntry>();

  return {
    arm() {
      if (armed) return;
      armed = true;
      byOwner = new Map();
      original = target.renderBufferDirect;
      const wrapped = original;
      target.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
        const owner = ownerName(object, root, ownerDepth);
        const instanced = Boolean((object as InstancedMesh).isInstancedMesh);
        const instances = instanced ? (object as InstancedMesh).count : 1;
        const vertices = group ? group.count : (geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0);
        const entry = byOwner.get(owner) ?? { owner, calls: 0, triangles: 0, instanced };
        entry.calls += 1;
        entry.triangles += Math.floor(vertices / 3) * instances;
        entry.instanced = entry.instanced || instanced;
        byOwner.set(owner, entry);
        wrapped.call(target, camera, scene, geometry, material, object, group);
      };
    },
    finish(frame) {
      if (!armed) return null;
      armed = false;
      if (original) target.renderBufferDirect = original;
      original = null;
      const owners = [...byOwner.values()].sort((a, b) => b.calls - a.calls || a.owner.localeCompare(b.owner));
      return {
        owners,
        attributedCalls: owners.reduce((sum, entry) => sum + entry.calls, 0),
        rendererCalls: target.info.render.calls,
        sampledAtFrame: frame,
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/three/garden-draw-census`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into the frame loop and metrics**

In `src/renderer/render-types.ts` add to `PharosVilleRenderMetrics`: `drawOwnerCensus: DrawOwnerCensus | null;`. In `world-renderer.ts`: immediately AFTER `const scene = createGardenScene(...)` (≈734–739; the renderer alone exists at 701 but `scene.root` does not yet) create `const drawRecorder = createDrawOwnerRecorder(renderer, scene.root);` (the `WebGLRenderer` satisfies `DrawRecorderTarget` structurally). Keep `let lastDrawOwnerCensus: DrawOwnerCensus | null = null;` and `let drawCensusRequested = false;` beside `lastTextureOwnerCensus` (≈752). In the block that refreshes the texture census when `contentReplacementCount` changes (≈1253–1260) set `drawCensusRequested = true` — do NOT arm there.

**Placement is load-bearing.** The frame resets `renderer.info` three times: at 1104 (PMREM bake window), at 1129 (wake feedback window → `recurringOffscreenCalls` at 1150), and at 1160 (the scene window whose total becomes `sceneCalls` at 1249). The census must reconcile to `sceneCalls`, so: immediately AFTER the reset at 1160 → `if (drawCensusRequested) { drawCensusRequested = false; drawRecorder.arm(); }`; immediately AFTER `post.render(aoDeltaSeconds)` at 1245 and BEFORE `const renderInfo = renderer.info.render` at 1248 → `const sampled = drawRecorder.finish(frameCounter); if (sampled) { lastDrawOwnerCensus = sampled; if (sampled.attributedCalls !== sampled.rendererCalls) console.warn("[pharosville] draw census did not reconcile", sampled.attributedCalls, sampled.rendererCalls); }`. Arming anywhere earlier would fold the PMREM bake and wake passes into the census while `sceneCalls` deliberately excludes them. (Use whatever frame counter the loop already keeps; if none, count frames locally in the renderer.) Add `drawOwnerCensus: lastDrawOwnerCensus,` to the metrics object (≈1309) and `drawOwnerCensus: null` to the zero-metrics default (≈1320–1331). Update exhaustive metric mocks in `src/hooks/use-world-render-loop.test.tsx` / `src/three/world-renderer.test.ts` (grep `textureOwnerCensus` and add the sibling key).

- [ ] **Step 6: Preview flag**

In `scripts/pharosville/preview.mjs`: add `--draw-census` to the usage block (after line 60); read `m?.drawOwnerCensus ?? null` into the metrics snapshot (≈1197); add:

```js
function printDrawOwnerCensus(census) {
  if (!census) { console.log("draws      owner census unavailable"); return; }
  const reconciled = census.attributedCalls === census.rendererCalls ? "reconciled" : "MISMATCH";
  console.log(`draws      ${census.attributedCalls} attributed · ${census.rendererCalls} renderer.info · ${reconciled}`
    + ` · frame ${census.sampledAtFrame}`);
  for (const entry of census.owners) {
    console.log(`           ${String(entry.calls).padStart(4, " ")}  ${String(entry.triangles).padStart(8, " ")}`
      + `  ${entry.instanced ? "I" : " "}  ${entry.owner}`);
  }
}
```

Call it when `args["draw-census"]` is set (beside the texture census printer, ≈386–391). In `--assert` mode, a `MISMATCH` census is a FAIL (exit 1): an attribution that does not sum to the renderer's own count is not a measurement.

- [ ] **Step 7: Validate on the real GPU**

Run: `npm run preview -- --url http://localhost:5173 --draw-census --out w0-census-baseline.png`
Expected: `draws … reconciled`; the sum equals the `draw` line's scene calls for the sampled frame (the `draw` line's `recurring` figure is a rolling read and may differ by the offscreen wake pair — the census line reconciles against its OWN frame's `info`). Save the table to `outputs/w0-census-baseline.txt`.

- [ ] **Step 8: Focused tests, then commit**

Run: `npm test -- src/three/garden-draw-census src/three/world-renderer src/hooks/use-world-render-loop`
Expected: PASS.

```bash
git add src/three/garden-draw-census.ts src/three/garden-draw-census.test.ts src/renderer/render-types.ts src/three/world-renderer.ts scripts/pharosville/preview.mjs docs/pharosville/TESTING.md
git commit -m "feat(renderer): a draw-call census that names every owner and reconciles to info"
```


### Task 2: Baseline and allocation

**Files:**
- Modify: `agents/2026-09-02-wave0-draw-call-funding-plan.md` (this file — fill the table below)
- Scratch: `outputs/w0-census-baseline.txt`, `outputs/w0-baseline-{day,dusk,night,wholemap}.png`

- [ ] **Step 1: Capture the four baseline frames**

```bash
npm run preview -- --url http://localhost:5173 --out w0-baseline-day.png
npm run preview -- --url http://localhost:5173 --hash "#t=19" --out w0-baseline-dusk.png
npm run preview -- --url http://localhost:5173 --hash "#t=22&n=1" --out w0-baseline-night.png
npm run preview -- --url http://localhost:5173 --hash "#cam=0,0,0.28" --draw-census --out w0-baseline-wholemap.png
```

- [ ] **Step 2: Fill the allocation table from the census**

Group the census rows by owner prefix and fill in:

| Owner group | Baseline calls | Target | Task |
|---|---|---|---|
| `docks/*` (all per-dock meshes + flags + cranes + lanterns) | | ≤ 20 | Task 3–4 |
| `island/*` | | ≤ 12 | Task 5 |
| `ships/hero-*` (per hero root) | | ≤ 2 per hero | Task 6 (only if baseline > 2/hero) |
| `ships/fleet-*` | | 15 (unchanged) | — |
| everything else | | unchanged | — |

Decision rule: Tasks 3–5 always run (they are the infrastructure Wave 1–3 build on). Task 6 runs only if the census shows more than two recurring draws per hero root. If, after Tasks 3–5, the default framing is still above 450 calls, add a Task 7 for the next-largest owner group in the census before declaring the wave done — do not close the wave on estimates.

- [ ] **Step 3: Commit the filled table**

```bash
git add agents/2026-09-02-wave0-draw-call-funding-plan.md
git commit -m "docs(plan): wave 0 baseline census and allocation"
```

---

### Task 3: Dock recipes — `createDock` stops making meshes

Today `createDock` (`garden-docks.ts:262-909`) builds per-dock materials (`timber`, `stone`, `metal`, `accentMaterial`, warehouse wall, windows, lamp material) and per-dock meshes/`InstancedMesh`es. This task turns it into an **author** that returns geometry and prop *recipes* in dock-local space; nothing about WHAT is authored changes.

**Files:**
- Modify: `src/three/garden-docks.ts`
- Modify: `src/three/garden-docks.test.ts:46-66` (budget test) and any test reading `visual.root.getObjectByName(...)`

**Interfaces:**
- Produces:
  ```ts
  export type HarborBucket = "timber" | "stone" | "metal" | "accent" | "wall" | "window" | "roof";
  export type HarborPropKind = "post" | "lampHead" | "plank" | "bollard" | "crate" | "barrel" | "pylon" | "piling";
  export interface HarborBucketPart { bucket: HarborBucket; geometry: BufferGeometry; color: Color; fineDetail: boolean; castShadow: boolean }
  export interface HarborPropInstance { kind: HarborPropKind; matrix: Matrix4; color: Color | null; fineDetail: boolean }
  export interface HarborFlagSpec { chainId: string; atlasCell: number; accent: Color; placement: { x: number; y: number; z: number; yaw: number; scale: number }; sag: number; wavePhase: number }
  export interface DockRecipe {
    dock: DockNode;
    /** dock-local → world; every part/prop matrix is pre-multiplied by this before batching */
    rootMatrix: Matrix4;
    anchorPosition: Vector3; anchorRotationY: number;      // for the persistent anchor Group
    parts: HarborBucketPart[];
    props: HarborPropInstance[];
    flag: HarborFlagSpec;
    // unchanged contracts, still dock-local:
    cargoTideLanes: CargoTideLanes; tideFace: DockVisual["tideFace"]; footprint: DockVisual["footprint"];
    identity: HarborIdentity; lampWorldPositions: { x: number; z: number }[]; plan: HarborPlan; signature: HarborSignature;
    quayHealth: number; accentColor: Color;
  }
  export function authorDock(dock: DockNode, displayTile, islandTile): DockRecipe
  ```
- `createDock` is deleted (clean cutover). `DockVisual` shrinks to `{ recipe: DockRecipe; root: Group /* anchor */; fineDetail: Group /* anchor for fine-detail toggling, see Task 4 */ }` and is produced by the batch in Task 4, not here.

- [ ] **Step 1: Write the failing test**

Replace the "instances props so a dock stays within a tight draw budget" test with:

```ts
it("authors a harbour as bucket parts and prop instances, never meshes", () => {
  const recipe = authorDock(dock("base", 7, 0.3), DISPLAY_TILE, ISLAND_TILE);
  const buckets = new Set(recipe.parts.map((part) => part.bucket));
  expect([...buckets].sort()).toEqual(["accent", "metal", "roof", "stone", "timber", "wall", "window"]);
  const kinds = new Set(recipe.props.map((prop) => prop.kind));
  for (const kind of ["post", "lampHead", "plank", "bollard", "crate", "barrel", "pylon", "piling"]) {
    expect(kinds.has(kind as HarborPropKind), kind).toBe(true);
  }
  // Stone carries the quay-health tint per dock: the bucket material is shared world-wide,
  // so the colour MUST travel with the part.
  const stone = recipe.parts.find((part) => part.bucket === "stone")!;
  expect(stone.color.getHexString()).not.toBe("ffffff");
  expect(recipe.flag.atlasCell).toBeGreaterThanOrEqual(-1);
  expect(recipe.rootMatrix.determinant()).toBeCloseTo(1, 5);
});

it("keeps the quay materials' height-fog contract on the recipe, not on a material", () => {
  const recipe = authorDock(dock("base", 7), DISPLAY_TILE, ISLAND_TILE);
  expect(recipe.identity).toBeDefined();
  expect(recipe.parts.every((part) => part.geometry.getAttribute("position").count > 0)).toBe(true);
});
```

Keep every other `garden-docks.test.ts` assertion that reads `identity`, `signature`, `footprint`, `tideFace`, `cargoTideLanes`, `lampWorldPositions`, `plan` — they move from `visual.x` to `recipe.x`. Delete the test at lines 68–93 ("reuses the quay materials' height fog") — the fog contract moves to the batch (Task 4 tests it there).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/three/garden-docks`
Expected: FAIL — `authorDock is not exported`.

- [ ] **Step 3: Refactor `createDock` → `authorDock`**

Mechanical transformation of lines 302–909:
- Delete the seven per-dock `MeshStandardMaterial` constructions (302–323, 594–598, lamp material ≈820–828, window material ≈840–850). Record instead `quayHealth`, `accentColor` and the derived colours: `stoneColor = new Color("#665f55").lerp(new Color("#a39d8c"), quayHealth)`, `timberColor = HARBOR_PALETTE.timber_mid`, `metalColor = "#6d5d49"`, `wallColor` (whatever line 594–598 used), `windowColor`, `lampColor`.
- Each `pushGeometry(deckParts, …)` etc. stays; at the end, instead of `new Mesh(mergeBucket(deckParts), timber)` push `{ bucket: "timber", geometry: mergeBucket(deckParts), color: timberColor, fineDetail: false, castShadow: true }` into `parts`. Same for stone (`stoneParts` + `moleParts` + masonry cracks), wall, roof (`accent`, `castShadow: true`), windows (`window`, emissive handled by the batch material), crane frame (`timber`) and crane fittings (`metal`).
- Each `InstancedMesh` site (planks 651, pylons 679, bollards 711, ropes 729, crates 740, barrels 760, posts 808, lamp heads 830, pilings via `createPierPilings` 384) becomes a loop pushing `{ kind, matrix: scratchMatrix.clone(), color, fineDetail }` into `props`. Mooring ropes were `fineDetail` children → `fineDetail: true`; crates/barrels/planks likewise if they lived under `fineDetail` (check each `fineDetail.add(...)` call).
- `createChainFlag` (1012–1071) → returns `HarborFlagSpec` (cell, accent, placement, sag, wavePhase); the cloth geometry is built by the batch.
- Compute `rootMatrix` from `setTilePosition(root, displayTile, GARDEN_DOCK_ROOT_Y)` + `root.rotation.y` (lines 271–274) using a scratch `Object3D`: `scratch.position/rotation → scratch.updateMatrix(); rootMatrix = scratch.matrix.clone()`.
- `applyGardenHeightFog(root, { epistemicHaze: "quay" })` (887) is removed here; the batch applies it to bucket materials (Task 4).
- Return the `DockRecipe`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/three/garden-docks`
Expected: PASS. `world-renderer.ts` will not compile yet (it still calls `createDock`); that is Task 4's first step. Do not commit a red tree: run Task 4 Steps 1–4 before committing, or commit Task 3 and 4 together as one slice if Task 4 lands the same day.

---

### Task 4: `garden-harbor-batch.ts` — one harbour ring, ~14 draws

**Files:**
- Create: `src/three/garden-harbor-batch.ts`
- Create: `src/three/garden-harbor-batch.test.ts`
- Modify: `src/three/world-renderer.ts:3043-3075` (`buildDocksPart`), 2056–2070 (`dockAccentMaterial`/`dockAccentColors`), `stageDockAccentTransitions` and its per-frame easing, the fine-detail zoom/hover toggle site (grep `fineDetail.visible`), `flagStaticShadowUsers` calls, `registerHarborWater`, `registerLightLanes`, `buildCargoTidePart` (reads `content.docks[i].cargoTideLanes` → `recipe.cargoTideLanes`), tide-line creation (reads `tideFace`)
- Modify: `docs/pharosville/THREEJS_AGENT_REFERENCE.md` (harbor batch section)

**Interfaces:**
- Consumes: `DockRecipe`, `authorDock` (Task 3); `patchGardenHeightFogMaterial`/`applyGardenHeightFog` from `garden-height-fog.ts`; `gardenChainFlagAtlas`, `gardenChainFlagCellUv` from `garden-chain-flag.ts`.
- Produces:
  ```ts
  export interface DockVisual { recipe: DockRecipe; root: Group; fineDetail: Group }   // anchors only, no drawables
  export interface GardenHarborBatch {
    root: Group;                          // name "harbor-batch"
    docks: DockVisual[];                  // same order as world.docks
    bucketMeshes: Record<HarborBucket, Mesh | null>;          // one merged mesh per bucket, vertexColors
    fineDetailBucketMeshes: Record<HarborBucket, Mesh | null>;// same, for fineDetail parts
    propMeshes: Record<HarborPropKind, InstancedMesh | null>; // one per kind, world-space matrices
    fineDetailPropMeshes: Record<HarborPropKind, InstancedMesh | null>;
    flags: InstancedMesh;                 // all chain flags, one draw; per-instance yaw set each frame
    setFineDetailVisible(visible: boolean): void;
    setDockAccent(chainId: string, color: Color): void;       // rewrites that dock's vertex-colour range in the roof/accent buckets
    setFlagYaw(chainId: string, yaw: number): void;
    dispose(): void;
  }
  export function createGardenHarborBatch(recipes: readonly DockRecipe[]): GardenHarborBatch
  ```
- Bucket materials (one each, shared): `timber` `{roughness .88, vertexColors}`; `stone` `{flatShading, roughness .97, vertexColors}`; `metal` `{metalness .42, roughness .62, vertexColors}`; `accent`/`roof` `{flatShading, roughness .86, side: DoubleSide, vertexColors}`; `wall` (copy the material params from the old 594–598 site, `vertexColors`); `window` `{emissive, emissiveIntensity as before, vertexColors}`. All patched with `applyGardenHeightFog(root, { epistemicHaze: "quay" })` so the Chains-staleness haze contract survives.
- Vertex colours: for each part, `geometry.setAttribute("color", Float32BufferAttribute filled with part.color)` then `geometry.applyMatrix4(recipe.rootMatrix)`, then `mergeGeometries(parts, false)` per bucket. Record `[start, count]` vertex ranges per `(chainId, bucket)` so `setDockAccent` can rewrite one dock's roof colours in place (`attribute.needsUpdate = true`), which is what the accent-transition easing calls per frame.
- Props: per kind, one `InstancedMesh(geometryFor(kind), materialFor(kind), total)`; matrices are `rootMatrix × prop.matrix`; colours via `instanceColor` where `prop.color` is set (lamp heads, bollard lean is already in the matrix). Geometries and materials per kind are the ones the old per-dock `InstancedMesh` sites used (e.g. `SphereGeometry(0.21, 6, 4)` for lamp heads at 829).
- Flags: `InstancedMesh(clothGeometry, flagMaterial, recipes.length)`; the cloth wave/sag baked per instance is not possible with one geometry, so use ONE cloth geometry (mean sag/wavePhase) and carry the chain's atlas cell through a per-instance `aFlagCell` attribute consumed in a small `onBeforeCompile` UV remap (same technique as the fleet's `atlasCell`, see `garden-fleet-batch.ts` ≈1394+ and `garden-sail-texture.ts`). `setFlagYaw` writes the instance matrix; the caller that today rotates `dock-chain-flag-wind-pivot` calls it instead.
- Anchors: per dock, `root = new Group(); root.name = \`dock-anchor-${chainId}\`; root.position/rotation from recipe.anchorPosition/anchorRotationY`; `fineDetail = new Group(); fineDetail.name = "dock-fine-detail"` under it. Both carry NO drawables. `part.cues.set(detailId, { radius: 2.5, root, y: 0.08 })` keeps working; `gardenDockLampWorldPositions` reads `recipe.lampWorldPositions` (already world-space per the old contract).
- Shadows: bucket meshes with any `castShadow` part → `castShadow = true`, `receiveShadow = true`; fine-detail meshes receive only; lamp-head prop mesh `castShadow = false`. `flagStaticShadowUsers(batch.root)` once, `flagStaticShadowUsers(fineDetail…, false)` is replaced by setting the fine-detail meshes' flags directly.

- [ ] **Step 1: Write the failing tests**

```ts
// src/three/garden-harbor-batch.test.ts
import { Color, InstancedMesh, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { authorDock } from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";
import { countDrawableObjects } from "./garden-util";
import { dockFixture, DISPLAY_TILES, ISLAND_TILE } from "./__fixtures__/harbor";  // lift `dock()` from garden-docks.test.ts into a shared fixture

const CHAINS = ["ethereum", "base", "arbitrum", "polygon", "bsc", "tron", "solana", "hyperliquid", "aptos"];

function batchOfNine() {
  return createGardenHarborBatch(CHAINS.map((id, i) => authorDock(dockFixture(id, 3 + (i % 7)), DISPLAY_TILES[i], ISLAND_TILE)));
}

describe("createGardenHarborBatch", () => {
  it("draws nine harbours in at most 20 drawables and leaves every dock anchor empty", () => {
    const batch = batchOfNine();
    expect(countDrawableObjects(batch.root)).toBeLessThanOrEqual(20);
    for (const dock of batch.docks) {
      expect(countDrawableObjects(dock.root)).toBe(0);
      expect(dock.root.name).toBe(`dock-anchor-${dock.recipe.dock.chainId}`);
    }
  });

  it("places every prop of every kind in one instanced mesh per kind", () => {
    const batch = batchOfNine();
    const expected = new Map<string, number>();
    for (const dock of batch.docks) for (const prop of dock.recipe.props) {
      if (prop.fineDetail) continue;
      expected.set(prop.kind, (expected.get(prop.kind) ?? 0) + 1);
    }
    for (const [kind, count] of expected) {
      const mesh = batch.propMeshes[kind as keyof typeof batch.propMeshes];
      expect(mesh, kind).toBeInstanceOf(InstancedMesh);
      expect(mesh!.count).toBe(count);
    }
  });

  it("recolours one dock's roofs in place without touching its neighbours", () => {
    const batch = batchOfNine();
    const roof = batch.bucketMeshes.roof as Mesh;
    const colors = roof.geometry.getAttribute("color");
    const before = Array.from(colors.array);
    batch.setDockAccent("solana", new Color("#ff0000"));
    const after = Array.from(colors.array);
    const changed = before.filter((v, i) => v !== after[i]).length;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(before.length / 4);   // one dock of nine, roofs only
    expect(colors.needsUpdate || (colors as any).version > 0).toBeTruthy();
  });

  it("toggles fine detail as a whole and keeps the quay height-fog contract on every bucket material", () => {
    const batch = batchOfNine();
    batch.setFineDetailVisible(false);
    for (const mesh of Object.values(batch.fineDetailBucketMeshes)) if (mesh) expect(mesh.visible).toBe(false);
    for (const mesh of Object.values(batch.fineDetailPropMeshes)) if (mesh) expect(mesh.visible).toBe(false);
    for (const mesh of Object.values(batch.bucketMeshes)) {
      if (!mesh) continue;
      expect((mesh.material as any).userData.gardenHeightFog).toBeTruthy();
    }
  });

  it("flies nine flags from one instanced cloth and turns one without turning the rest", () => {
    const batch = batchOfNine();
    expect(batch.flags.count).toBe(9);
    const m = new (require("three").Matrix4)();
    batch.flags.getMatrixAt(1, m); const beforeBase = m.clone();
    batch.setFlagYaw("ethereum", 1.2);
    batch.flags.getMatrixAt(1, m);
    expect(m.equals(beforeBase)).toBe(true);
  });
});
```

Create `src/three/__fixtures__/harbor.ts` exporting `dockFixture` (the `dock()` helper currently local to `garden-docks.test.ts`), `DISPLAY_TILES` (nine tiles on a ring of radius 14 tiles around `ISLAND_TILE`), and `ISLAND_TILE`. Update `garden-docks.test.ts` to import from it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/three/garden-harbor-batch`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `createGardenHarborBatch`** per the Interfaces block. Keep it under ~400 lines; the flag UV-remap shader patch is the only non-obvious piece — copy the pattern from `garden-fleet-batch.ts` (`atlasCell` attribute → `vUv` offset/scale in `onBeforeCompile`) and set `material.customProgramCacheKey = () => "garden-harbor-flag-v1"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/three/garden-harbor-batch src/three/garden-docks`
Expected: PASS.

- [ ] **Step 5: Cut `world-renderer.ts` over**

- `buildDocksPart`: `const recipes = world.docks.map((dock) => authorDock(dock, gardenDockDisplayTile(dock.tile), islandTile)); const batch = createGardenHarborBatch(recipes); part.root.add(batch.root); for (const dock of batch.docks) { part.root.add(dock.root); part.cues.set(dock.recipe.dock.detailId, { radius: 2.5, root: dock.root, y: 0.08 }); } flagStaticShadowUsers(batch.root); content.docks = batch.docks; content.harborBatch = batch;` — keep the harbor lanterns block unchanged.
- `dockAccentMaterial`/`dockAccentColors`/`stageDockAccentTransitions` and the per-frame easing: replace material-colour lerps with `content.harborBatch.setDockAccent(chainId, easedColor)`. The "before" snapshot becomes `Map<chainId, recipe.accentColor>` read from the outgoing `content.docks`.
- Fine-detail zoom/hover site: replace the per-dock `dock.fineDetail.visible = …` loop with a single `content.harborBatch.setFineDetailVisible(visible)` (hover/selection-specific per-dock fine detail, if any exists at that site, is dropped — verify by grep; if a per-dock case exists, keep the per-dock anchors' `visible` flags as the intent record and OR them into the batch call).
- Flag wind: where `dock-chain-flag-wind-pivot` rotation is written per frame, call `content.harborBatch.setFlagYaw(chainId, staticYaw + windOffset)`.
- `buildCargoTidePart`, tide-line, `registerHarborWater`, `registerLightLanes`: change `dock.cargoTideLanes` → `dock.recipe.cargoTideLanes`, `dock.tideFace` → `dock.recipe.tideFace`, `dock.footprint`, `dock.identity`, `dock.plan`, `dock.signature`, `dock.dock` → `dock.recipe.dock`. Use `lsp rename`/references on `DockVisual` fields to find every site.
- `disposeWorldContentPart` for `"docks"` must call `content.harborBatch?.dispose()` (geometries + the 7 bucket materials + prop materials + flag material) before `disposeThreeObjectTree`.
- Add `harborBatch: GardenHarborBatch | null` to `GardenContent`.

- [ ] **Step 6: Renderer tests**

Run: `npm test -- src/three src/renderer`
Expected: PASS. Expect to update `world-renderer.test.ts` assertions that counted per-dock drawables or looked up `dock-warehouse-roofs`.

- [ ] **Step 7: Real-GPU gate**

```bash
npm run preview -- --url http://localhost:5173 --draw-census --out w0-t4-day.png
npm run preview -- --url http://localhost:5173 --hash "#t=22&n=1" --out w0-t4-night.png
npm run preview -- --url http://localhost:5173 --hash "#cam=0,0,0.28" --out w0-t4-wholemap.png
npm run preview -- --url http://localhost:5173 --assert
```

Expected: `docks/*` owner rows collapse to ≤ 20 total; total recurring calls fall by (baseline docks − ≤20); day/night/whole-map frames indistinguishable from `w0-baseline-*` at 100 % (quay colours, roof accents, lamp glow, flags all present; no z-fighting; shadows on quays intact at `#t=19`); `--assert` exits 0. Then exercise: hover a harbour (fine detail appears), select Ethereum (detail panel, cue ring at the anchor), drag time through dusk (accent transition eases), zoom to whole map (fine detail hides).

- [ ] **Step 8: Docs and commit**

Add a "Harbor batch" paragraph to `docs/pharosville/THREEJS_AGENT_REFERENCE.md`: authored recipes → world-wide bucket/prop batches; anchors carry no drawables; `setDockAccent`/`setFlagYaw`/`setFineDetailVisible` are the only mutation surface; Wave 3 station archetypes author into the same recipes.

```bash
git add src/three/garden-docks.ts src/three/garden-docks.test.ts src/three/garden-harbor-batch.ts src/three/garden-harbor-batch.test.ts src/three/__fixtures__/harbor.ts src/three/world-renderer.ts src/three/world-renderer.test.ts docs/pharosville/THREEJS_AGENT_REFERENCE.md
git commit -m "feat(harbor): build the whole ring in one batch, and let each quay keep its anchor"
```

---

### Task 5: Island statics merge

**Files:**
- Modify: `src/three/garden-island.ts` (add `mergeIslandStatics` and call it at the end of `createTerracedIsland`)
- Modify: `src/three/garden-island.test.ts` (or create if absent)

**Interfaces:**
- Produces: `export function mergeIslandStatics(root: Group): { merged: number; kept: number }` — merges every **non-instanced, non-dynamic `Mesh`** child of the island root that shares a `MeshStandardMaterial` *signature* (`flatShading, roughness, metalness, side, emissive hex, transparent, opacity, map===null`) into one mesh per signature with vertex colours carrying the original `material.color`. Skips: `InstancedMesh`; anything named in `ISLAND_DYNAMIC_NAMES = ["island-reflection-pond-skin", "island-raked-gravel" /* has a normal map */, …]` (fill from the census — anything with a texture map, a `ShaderMaterial`, per-frame uniform writes such as koi/pond, or an `onBeforeCompile` patch); anything whose `userData.gardenKeepSeparate` is set.
- Preserves: `castShadow`/`receiveShadow` (merge groups split by the pair), `name` becomes `island-merged-<signature-index>`, world transform baked with `applyMatrix4(child.matrix)` (island children are direct children of the root or one level down — use `matrixWorld` relative to root after `root.updateMatrixWorld(true)`).

- [ ] **Step 1: Write the failing test**

```ts
// src/three/garden-island.test.ts (append)
it("merges the static rock into a handful of draws and never touches the pond, gravel or instanced planting", () => {
  const island = createTerracedIsland(/* existing test args */);
  const before = countDrawableObjects(island.root);
  const { merged } = mergeIslandStatics(island.root);
  const after = countDrawableObjects(island.root);
  expect(merged).toBeGreaterThan(0);
  expect(after).toBeLessThanOrEqual(12 + countInstanced(island.root));
  for (const name of ["island-reflection-pond-skin", "island-raked-gravel", "island-tree-crowns", "island-shoreline-boulders"]) {
    expect(island.root.getObjectByName(name), name).toBeDefined();
  }
  expect(after).toBeLessThan(before);
});
```

(`countInstanced` = traverse counting `isInstancedMesh`; define locally in the test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/three/garden-island`
Expected: FAIL — `mergeIslandStatics` not exported.

- [ ] **Step 3: Implement** per Interfaces. Signature key: `` `${m.flatShading}|${m.roughness}|${m.metalness}|${m.side}|${m.emissive.getHexString()}|${m.emissiveIntensity}|${m.transparent}|${m.opacity}|${cast}|${receive}` ``. For each group with ≥2 members: clone geometries, `toNonIndexed()` if indexed, apply relative matrix, add `color` attribute from `material.color`, `mergeGeometries`, new `MeshStandardMaterial({ ...signature params, color: "#ffffff", vertexColors: true })`, dispose the originals' geometries (materials are disposed by the part disposer through the tree walk; the merged material is added to the tree so it is disposed the same way). Call `patchGardenHeightFogMaterial` on the merged material if any source material had `userData.gardenHeightFog`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/three/garden-island src/three/world-renderer`
Expected: PASS.

- [ ] **Step 5: Real-GPU gate**

```bash
npm run preview -- --url http://localhost:5173 --draw-census --out w0-t5-day.png
npm run preview -- --url http://localhost:5173 --hash "#t=19" --out w0-t5-dusk.png
```

Expected: `island/*` rows ≤ 12 non-instanced + instanced kinds; frames indistinguishable from baseline (terrace colours identical, dusk shadows on the rock identical). If a merged surface changes shade, its material signature missed a parameter — add it to the key rather than accepting drift.

- [ ] **Step 6: Commit**

```bash
git add src/three/garden-island.ts src/three/garden-island.test.ts
git commit -m "feat(island): merge the standing stone by material, keep the water and gravel apart"
```

---

### Task 6 (conditional): Hero residue merge

Run only if Task 2's census shows > 2 recurring draws per `hero-*` root.

**Files:**
- Modify: `src/three/garden-ships.ts:1223-1341` (`attachGardenHeroModel`, `mergeGardenHeroStatics`) and the `heroHideable`/identity-sail/lantern sites ≈799–1190

- [ ] **Step 1: Read the census rows for one hero** and list the drawables under its root that are not `hero-*-solid` / `hero-*-sail`. Typical residue: identity sail (must stay — it samples the fleet sail atlas), ship lantern (emissive, per-ship attention uniform), seaworthiness fittings (`ship-seaworthiness-fittings`, 1157), pennant, wake anchor.
- [ ] **Step 2: Write a failing test** in `garden-ships.test.ts`: after `attachGardenHeroModel`, `countDrawableObjects(visual.root)` ≤ 4 (solid, sail, identity sail, lantern).
- [ ] **Step 3: Fold the fittings mesh into the hero solid merge** — push its geometry (with its `fittingMaterial.color` as vertex colour) into `solidParts` inside `mergeGardenHeroStatics`, and hide the procedural fittings mesh via `heroHideable`. Fold the pennant the same way if it is static per ship (if it is wind-driven, leave it).
- [ ] **Step 4: Run** `npm test -- src/three/garden-ships` → PASS; preview `--draw-census` → hero roots at ≤ 4; frames indistinguishable.
- [ ] **Step 5: Commit** `feat(ships): fold hero fittings into the merged hull`.

---

### Task 8: Fleet wake batch (added 2026-09-02 from the first measured census)

The Task 1 census showed the largest owner is not docks or heroes: `content-part-ships/ship-wake` 116 calls + `ship-wake/ship-bow-wave` 108 calls ≈ **224 calls** at the default framing, and the count moves frame to frame with how many hulls have way on (the 693 → 676 → 578 total swings in the baseline runs are this). Each ship owns a `ship-wake` root (`garden-ships.ts` `createWake`, ≈2541–2598): a 7-quad trail `InstancedMesh` and a 2-quad bow `InstancedMesh`, both on the shared `cache.wakeFillMaterial` and one cached quad geometry, plus two `Line`s under `ship-wake-detail`. The per-frame loop (`world-renderer.ts` ≈4135–4140) toggles `visual.wake.visible` and sets `visual.wake.scale.x`. Same material, same geometry, per-ship mesh — the textbook case for one world-wide instanced batch. Run this task BEFORE Task 7; it is not conditional.

**Files:**
- Create: `src/three/garden-wake-batch.ts`, `src/three/garden-wake-batch.test.ts`
- Modify: `src/three/garden-ships.ts` (`createWake` → returns only the detail `Line` group; the `ShipVisual.wake` root becomes an empty anchor `Group` named `ship-wake`), `src/three/world-renderer.ts` (≈4135–4140 per-ship update → batch write; `buildShipsPart` creates/owns the batch; disposal), `src/three/garden-fleet-batch.ts` only if the capacity constant is reused from there.

**Interfaces:**
- Produces:
  ```ts
  export const WAKE_TRAIL_QUADS = 7; export const WAKE_BOW_QUADS = 2;
  export interface GardenWakeBatch {
    root: Group;                        // name "fleet-wakes"; two children: "fleet-wake-trails", "fleet-wake-bows"
    trails: InstancedMesh; bows: InstancedMesh;   // capacity × quads each, frustumCulled = false
    /** Writes this ship's 9 instance matrices from its world pose; hidden ships collapse to a zero-scale matrix. */
    setShip(slot: number, pose: { x: number; y: number; z: number; headingY: number; hullScale: number }, visible: boolean, intensityScaleX: number): void;
    /** Marks instanceMatrix.needsUpdate once per frame after all setShip calls. */
    commit(): void;
    dispose(): void;
  }
  export function createGardenWakeBatch(capacity: number /* GARDEN_FLEET_BATCH_CAPACITY */, material: Material, quadGeometry: BufferGeometry): GardenWakeBatch
  ```
- Local layout is copied verbatim from `createWake`: trail quad `index` → `scale(1.1 + age·1.7, 1, 0.9 + sin(age·π)·2.3)`, `position(−2.3 − age·3.9, −0.34, 0)` with `age = index/(WAKE_TRAIL_QUADS−1)`; bow quads → `scale(2.1, 1, 0.85)`, `position(3.15, −0.34, ±0.62)`. The per-ship wake root's former `scale.x` (intensity) multiplies the local X before composing with the ship's world matrix.
- **Slot allocation.** A fleet-batch slot is LOCAL to its silhouette (`writeFleetInstance` picks the silhouette, then `batch.hull.mesh.count`, `garden-fleet-batch.ts` ≈1398–1401) and collides across families and with hero indices — it must NOT be used. In `buildShipsPart`, allocate one unique `wakeSlot: number` (0…capacity−1) per ship in stable `content.ships` order, store it on every `ShipVisual` (heroes included — they have wakes too), and use only that for the batch. The transient selected outsider (a ship past capacity drawn only because it is selected) takes slot `capacity−1` reserved for it, or is skipped with its detail lines still shown — state which in the report.
- The `ship-wake-detail` `Line`s stay per ship under the anchor (they are LOD-gated to close zoom; census will show whether they matter — do not batch lines in this task).

- [ ] **Step 1: Write the failing tests** — `garden-wake-batch.test.ts`: (a) capacity 320 → `trails.count === 320·7`, `bows.count === 320·2`, exactly 2 drawables under `root`; (b) `setShip(3, {x:10,y:0,z:−4,headingY:π/2,hullScale:1}, true, 1.3)` then `commit()` → decomposing trail matrix for slot 3 quad 0 gives position ≈ ship pos + rotated `(−2.3·1.3, −0.34, 0)` and scale x ≈ `1.1·1.3`; (c) `setShip(3, …, false, 1)` → all 9 matrices of slot 3 have zero scale; (d) `commit()` sets `instanceMatrix.needsUpdate` on both meshes.
- [ ] **Step 2: Run** `npm test -- src/three/garden-wake-batch` → FAIL (module not found).
- [ ] **Step 3: Implement** per Interfaces (≈120 lines; scratch `Matrix4`/`Quaternion`/`Vector3`, no per-frame allocation).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Cut over.** `createWake` returns `{ detail, root }` where `root` is an empty named anchor (keep `root.visible=false` default so existing visibility logic still gates the detail lines). In `buildShipsPart`, create the batch once with `cache.wakeFillMaterial` and the cached `wake.quad` geometry and add `batch.root` to the part root; store `content.wakeBatch`. At ≈4135–4140 replace the visibility/scale writes with `content.wakeBatch.setShip(slot, pose, visible, 0.7 + min(1.5, wakeIntensity)·0.85 · overviewDetail)` and keep `visual.wake.visible = visible` for the detail lines; call `content.wakeBatch.commit()` once after the ship loop. Dispose in the ships part disposer.
- [ ] **Step 6: Run** `npm test -- src/three src/renderer` → PASS (update world-renderer tests that counted wake drawables or read `visual.wake.scale`).
- [ ] **Step 7: Real-GPU gate** — `npm run preview -- --url http://localhost:5173 --draw-census --out w0-t8-day.png` and `#t=22&n=1`: census shows `fleet-wakes/*` = 2 rows and no `ship-wake`/`ship-bow-wave` rows; wakes visible behind moving hulls exactly as in `w0-baseline-day.png` (same wedge shape, same fade); reduced motion still hides them (`--reduced` frame has none); `--assert` passes.
- [ ] **Step 8: Commit** `feat(ships): draw every wake from one batch`.

### Task 7: Wave gate and ledger

- [ ] **Step 1: Full real-GPU gate**

```bash
npm run preview -- --url http://localhost:5173 --draw-census --out w0-final-day.png
npm run preview -- --url http://localhost:5173 --hash "#t=19" --out w0-final-dusk.png
npm run preview -- --url http://localhost:5173 --hash "#t=22&n=1" --out w0-final-night.png
npm run preview -- --url http://localhost:5173 --hash "#cam=0,0,0.28" --out w0-final-wholemap.png
npm run preview -- --url http://localhost:5173 --assert
npm run preview -- --url http://localhost:5173 --assert --reduced
```

Expected: default framing ≤ 450 recurring calls; tier `full`; p95 ≤ 20 ms; both `--assert` arms exit 0; the four frames indistinguishable from `w0-baseline-*`. If calls are > 450, return to Task 2's decision rule and add the next owner group as Task 8 — the wave does not close on an estimate.

- [ ] **Step 2: Validation lane**

Run: `npm run validate:changed`
Expected: green. Fix anything it names; do not widen scope.

- [ ] **Step 3: Ledger**

Append to `agents/2026-09-02-grand-redesign-evaluation-and-plan.md` under Wave 0: baseline vs final calls/tris/geoms per owner group (from the two census tables), the frame pair paths, and any owner the census surprised us on. Update `docs/pharosville/TESTING.md` "Current resource ceilings" paragraph with the new measured default (calls), leaving the ceiling itself unchanged.

- [ ] **Step 4: Commit and hand off**

```bash
git add agents/2026-09-02-grand-redesign-evaluation-and-plan.md docs/pharosville/TESTING.md
git commit -m "docs(plan): wave 0 closed — the purse for the frame"
```

Then open Wave 1 planning (the frame) against the measured headroom.

---

## Self-review

- **Spec coverage:** §6 funding rows — docks (Tasks 3–4), heroes (Task 6, conditional on measurement per §7 Wave 0's "measure before and after"), island statics (Task 5), fleet unchanged (—), census as the gate (Task 1), shadow frustum growth is Wave 1's concern and is called out there, not here.
- **Placeholders:** the allocation table in Task 2 is intentionally blank until measured; every other step carries its content. `ISLAND_DYNAMIC_NAMES` is filled from the census in Task 5 Step 3 — the rule for filling it is stated.
- **Type consistency:** `DockRecipe`, `HarborBucket`, `HarborPropKind`, `HarborFlagSpec`, `GardenHarborBatch`, `DockVisual { recipe, root, fineDetail }` are used identically in Tasks 3, 4 and the world-renderer cutover. `drawOwnerCensus(root, rendererCalls, ownerDepth?)` matches its tests and its metrics wiring.

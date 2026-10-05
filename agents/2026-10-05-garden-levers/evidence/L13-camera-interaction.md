# L13 — Camera, navigation, interaction feel

## Verdict
The camera has sophisticated easing but three disconnected experiences: an authored rest picture, free pan/zoom, and postcard/tour travel. The biggest gap is **a coherent, inspectable stroll through garden places**: today Wander actively sends the visitor home when they try to interact with a place. Better viewpoints and navigation semantics matter more than another easing adjustment.

## Evidence

1. **Rest composition succeeds at monument hierarchy, not garden arrival.** `day-chrome.png` and `day-1200x640.png` hold the tower strongly right of centre, but the bottom roughly quarter-to-third is smooth green bank, with little invitation to enter. This confirms hypothesis 2's bank problem; the pine also reads as an isolated graphic bough. The rest objective measures tower foot/crown/span and station/inlet interference, not garden readability (`src/systems/camera.ts:409-411`). The fixed seat/lens is explicitly prescribed (`docs/pharosville/VISUAL_INVARIANTS.md:19-25`). `overview.png` confirms hypothesis 1's square-plate reading; giving unrestricted orbit would expose rather than solve it.

2. **Selection is unobstructed rather than cinematically composed.** `selected-usdc.png` devotes much of its upper half to sky/outer-ocean haze; the subject shares a busy dock cluster without the tower as orientation. The capture is a settled deep link, not evidence of the fly-to trajectory (`outputs/holistic/selected-usdc.json:1415-1418`). Its eye is actually 14.09 world units high (`:26-29`), so “sea-level” describes the reading, not literal height. Ships target only 10.5% frame height; the solver takes the first zero-occlusion candidate, searching low pitches before raised ones (`src/systems/camera.ts:697-716,778-779,1124-1135`). It does not score horizon height, contextual landmark, actual panel rectangle, or subject-versus-neighbour salience. This helps explain the crowding in hypothesis 4, but cannot by itself repair data encodings.

3. **A stroll seed already exists—do not reinvent it.** Six viewport-solved postcards include inlet, deck, mole, crane islet, tea-house and stair (`src/systems/postcards.ts:60-132`). However, they are a cyclic book, not a connected garden path. Any other world pointer/wheel/key input is consumed to return home (`src/hooks/use-canvas-resize-and-camera.ts:607-626`); the underlying postcard rig is deliberately the rest rig (`src/systems/postcards.ts:171-181`). [INFERENCE] This defeats inspecting a discovered feature and creates a sightseeing rather than inhabiting experience. It is mandated, not accidental (`docs/pharosville/CONTRACTS.md:427-432`).

4. **Motion machinery is already credible; smoothness is unmeasured here.** Wheel normalization, ground-anchored drag/zoom, exponential damping, 0.6-second rest hand-off, and quintic selection glides exist (`src/hooks/camera-intent.ts:27-53,169-191,280-289`; `src/systems/camera.ts:525-550`). There is no user orbit. Drag release has no velocity-based fling (`src/hooks/use-canvas-resize-and-camera.ts:829-842,893-898`), which is reasonable for calm. Collision handling is incomplete: endpoint selection probes land/stations, interactive bounds clamp map offsets, postcard travel adds a generic vertical arc, while ordinary selection uses a straight eye/target blend without that arc (`src/systems/camera.ts:569-606,1074-1078`; `src/hooks/use-canvas-resize-and-camera.ts:531,570-579`). [INFERENCE] Endpoint-clear shots can still traverse terrain; no capture here proves a collision.

5. **Discoverability is quieter than its meaning warrants.** Rest shows only “explore /”. Clicking expands controls, but `/` opens search (`src/components/world-controls.tsx:180-190`; `src/pharosville-world.tsx:1037-1046`). Wander hides in the opacity-zero revealed row (`src/pharosville.css:805-823`). Keyboard has a bounded, nontrapping map cycle and skip link; its ordering is viewport-target priority, not a spatial route (`src/hooks/use-world-keyboard-targets.ts:42-75,133-148`; `src/pharosville-world.tsx:1186-1201`). Hover offers identity plus size/risk water after 150ms dwell and 600ms fade-in; positioning uses target-top coordinates without local screen/panel avoidance (`src/hooks/hover-nameplate-dwell.ts:1-23`; `src/pharosville.css:1657-1669`; `src/hooks/use-world-render-loop.ts:970-975`). Actual flicker/edge clipping remains unobserved.

6. **Observe teaches data, but not garden space.** It chooses PSI, leading risk, weekly supply change and concentration with freshness qualifications (`src/systems/observe-sequence.ts:58-117`). Camera frames are frozen display tiles plus kind-based zoom; the tour only splines iso centre/zoom on a fixed-yaw rig, with 3.5s travel and 8.5s dwell (`src/pharosville-world.tsx:804-819`; `src/systems/observe-tour.ts:25-37`). [INFERENCE] Moving subjects can leave their initial frame. Reduced motion already offers manual steps—retain this.

## Levers — ranked

All levers retain the shared ceilings: 700 calls, 500 geometries, 500k triangles and 72 textures (`docs/pharosville/TESTING.md:98-103`). Camera-only changes need no new art assets or motion library; the previous release already used 948/963 KiB gzip (`agents/2026-10-02-visual-upgrade/02-execution-record.md:31`). Recheck close-view LOD and resources throughout travel, not only the idle endpoint.

### 1. Inspectable garden stroll · Impact 5 · Effort L
**Change:** Evolve `postcards.ts` and the camera hook into 4–6 authored stations connected by shore/precinct paths, with previous/next/home controls, persistent station identity and local selection. Progress only on request; screen features reveal sequentially, rather than all at once. Author collision-clear eye/target trajectories, not global flyover arcs; establish station-local gesture hand-off instead of the rest rig.
**Why:** Makes Japanese-garden sequencing the interaction model, not cultural prop dressing.
**Risk:** Terrain/path edits can invalidate views; low viewpoints expose unfinished assets.
**Touched:** Explicitly replace K44's forced-home rule (`CONTRACTS:427-432`); preserve static cuts (`:415-419`), DOM parity (`:24-26`), one clock and attention restraint (`VISUAL_INVARIANTS:97-112`). No automatic stroll.
**Dependencies:** Terrain, precinct/garden composition, chrome, shared projection/picking.
**Verification:** Real-GPU capture every station and intermediate path at four gate profiles; assert eye clearance, subject visibility, station-local return, interruption and reduced-motion cuts in postcard/camera-hook tests. Check all resource ceilings, not just rest.

### 2. Panel-aware subject tableaux · Impact 5 · Effort M
**Change:** Upgrade `camera.ts` from “first clear” to a bounded candidate score: subject silhouette/identity span, low sky occupancy, readable risk water, neighbour separation, contextual shore/landmark, and measured DOM panel exclusion. Allow an elevated three-quarter inspection view; retain the current eye when already well framed. Use a collision-clear trajectory for long moves and reveal facts immediately, independently of camera arrival.
**Why:** Selection becomes understanding rather than a scenic relocation.
**Risk:** Framing a tiny coin must not imply greater market importance; enlarged inspection is a viewing condition.
**Touched:** Shared picking/anchors and immediate details (`CONTRACTS:298-302`); existing code delays the panel to 70% glide (`src/pharosville-world.tsx:484-487`), a documentation/behavior mismatch to resolve intentionally. No fleet removal.
**Dependencies:** Actual hull bounds, risk-water geography, detail-panel layout.
**Verification:** USDC, tiny ship, moving ship, edge berth, dock and grave captures; assert panel clearance, path clearance, interruption, follow and Escape restoration. Target camera/hook tests plus browser interaction lane.

### 3. Reauthor the seat with its foreground · Impact 5 · Effort M
**Change:** Jointly adjust `rest-seat.ts`, rest shot specifications and threshold landform; replace a broad bank with a legible approach/stone interval and shaded near edge. Judge garden occupancy, negative water and landmark hierarchy together—not tower anchors alone.
**Risk:** Moving camera alone exposes plate edges or merely crops the problem away.
**Touched:** Challenge exact yaw/pitch/eye/FOV (`VISUAL_INVARIANTS:19-25`; `CONTRACTS:291-295`) and, with the terrain lens, textureless threshold prescription (`VISUAL_INVARIANTS:47-57`); retain crown sky, right-third hierarchy and open inlet.
**Dependencies:** Composition/terrain/vegetation owners.
**Verification:** Matched rest captures at four gate profiles and five phases, 16px blur, edge exposure and shared pick checks; update meaningful rest-shot assertions, not screenshots alone.

### 4. One calm navigation vocabulary · Impact 4 · Effort M
**Change:** Surface “Stroll” and “Find /” as distinct actions in `world-controls.tsx`; give station navigation explicit names and compact instructions. Reuse authored tableaux for Observe, retaining its data-ranked beats, captions and manual reduced-motion steps; resolve moving-subject framing at beat entry. Add tooltip screen/panel-safe placement and immediate keyboard-focus feedback without permanent label carpets.
**Risk:** Added chrome can intrude; normal-motion Tab currently cancels Observe (`src/pharosville-world.tsx:859-886`), so avoid a silent behavior change.
**Touched:** Keyboard/DOM usefulness and label clearance (`CONTRACTS:85-94`), observation principle (`PRODUCT.md:52-55`).
**Dependencies:** Levers 1–2, chrome and analytical narrative.
**Verification:** Headed keyboard walkthrough, search/selection parity, hover edges, tour interruption and manual step tests; measure tour/inspection resources on reference M5 Pro.

## Do-not-do / traps

- Do not add free orbit, automatic idle tours, camera shake or inertial fling as “advanced technology”; none repairs garden understanding (`PRODUCT.md:37-38`).
- Do not use depth-of-field to hide neighbouring records. An optional inspection-only focus pull merits an A/B later, not a main lever; rest must remain analytically readable.
- Do not repeat microscopic craft/easing changes. A2, B1 and P1 were visually rejected; W1 was unwarranted (`agents/2026-10-02-visual-upgrade/02-execution-record.md:17-20`).

## Invariants worth challenging

Challenge K44's forced return and frozen seat numbers, not its user-controlled motion principle. Resolve immediate-details versus delayed reveal. Retain same-origin APIs, desktop unmounting, complete ledger, fleet truth, local assets, WebGL renderer, zero-continuous-RAF reduced motion and hard budgets.

## Captures wanted

Run serially on real GPU; commands below are requests, not checks performed:

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#t=12.25' --seconds 20 --pan-zoom --hover-first --out levers/l13/gestures.png --json levers/l13/gestures.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1200 --height 640 --hash '#sel=ship.usdc-circle&t=12.25' --seconds 20 --out levers/l13/usdc-gate.png --json levers/l13/usdc-gate.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 900 --height 720 --hash '#sel=ship.usdc-circle&t=22' --reduced --out levers/l13/usdc-static-night.png --json levers/l13/usdc-static-night.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#t=12.25' --seconds 60 --burst 20 --interval 400 --burst-sheet --out levers/l13/navigation.png --json levers/l13/navigation.json
```

The last invocation requires orchestrator-controlled input during sampling: test W, local feature click, wheel, home, then Observe. Existing preview has no Wander/Observe replay flag; plan a deterministic capture driver for six stations and intermediate glides rather than inventing CLI options. Still images and code review do not establish interaction smoothness.

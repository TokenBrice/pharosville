# PharosVille — Astra refinement plan

Date: 2026-09-05

Reviewed revision: `8566b38` / v0.11.1

Status: original review and implementation scope. Authorized implementation and
local acceptance are complete;
see [the execution record](pharosville-astra-execution.md) for current changes,
acceptance evidence and remaining limitations. Measurements below describe the
reviewed revision, not the refined working tree.

## 1. Assessment

PharosVille already has a capable contemporary renderer. Its next substantial improvement should be a more coherent, beautifully composed image: connected water, convincing foreground forms, readable ships, and a static composition as considered as the moving one. Adding another atmospheric effect would currently yield less than correcting those foundations.

The strongest existing asset is the relationship between a richly modeled Pharos, broad water, restrained nautical forms, and the changing light. Preserve that identity. The weakest visible elements are the stepped transitions between water bodies, repetitive shore terraces, the enlarged foreground pine, and crowded sail silhouettes around berths. Interaction and data reliability also need attention: an experience that looks calm must remain easy to navigate and candid about what its instruments know.

**Recommended first sequence:** cache static sea-sign siting; remove undefined shader ramps; fix freshness and focus defects; then refine water continuity and the static fleet composition. Follow with foreground landscape and material character. Expose the existing dawn/dusk and stillness capabilities before funding new graphics technology.

Priority meanings: **P1** should lead this refinement; **P2** is worthwhile after the foundations; **P3** is conditional on evidence. These are delivery priorities, not security severity labels. Effort below is relative: S = a localized implementation, M = several related modules and visual tuning, L = a coordinated composition change.

## 2. Evidence and scope

The review covered current rendering and shader ownership, terrain and fleet composition, motion/display/hit-test parity, app loading, selection and keyboard interaction, analytical DOM surfaces, data freshness, proxy failure handling, and validation/maintenance. Three independent review lanes covered rendering, experience, and engineering; their findings were reconciled with source and real-GPU captures.

This is a broad engineering and visual review, not a claim to have exhaustively executed every runtime path, audited every copied shared-data module, or completed a formal security audit. In particular, storm extremes, a long continuous day-cycle transition, all quality tiers, non-Apple GPU drivers, ultrawide/HiDPI, and the full accessibility suite remain acceptance work for implementation. A still image cannot establish temporal stability.

### Current visual evidence

All appearance evidence was captured through the repository's supported `npm run preview` using the operator's Chrome at `http://localhost:5173/`. The renderer identified itself as **ANGLE Metal, Apple M5 Pro**. No bundled Playwright frame was used to judge appearance or speed. Data was the locally served live feed, with 185 ships; these are review captures, not immutable fixture baselines. Time, viewport and motion mode were pinned as listed.

| Capture | State | Observations | Resource/pacing evidence |
| --- | --- | --- | --- |
| [Day](../outputs/astra-day.png) · [log](../outputs/astra-day.log) | 1600×1000, DPR 1, `#t=12`, animated | Strong lighthouse silhouette; muted material separation; visible shore bands; rigid foreground pine intersects fleet silhouettes | **PASS:** full, 60 fps, worst-window p95 16.8 ms; 249 recurring calls, 339,706 triangles, 227 geometries, 42 textures |
| [Night](../outputs/astra-night.png) · [log](../outputs/astra-night.log) | 1600×1000, DPR 1, `#t=22`, animated | Beacon dominates successfully; water boundaries become large zigzag seams; some signs and shoreline foam attract disproportionate attention | **PASS:** full, 60 fps, worst-window p95 16.8 ms; 252 calls, 339,674 triangles, 231 geometries, 42 textures |
| [Dusk whole map](../outputs/astra-dusk-overview.png) · [log](../outputs/astra-dusk-overview.log) | 1600×1000, DPR 1, `#t=18&cam=0,0,0.28`, reduced motion | Complete plate; readable overall geography; enlarged steles become visually heavy; berth clusters remain dense | Settled static observation, **not run with `--assert`**: full; 218 calls, 318,740 triangles, 199 geometries, 42 textures |
| [Wide laptop](../outputs/astra-laptop-welcome.png) · [log](../outputs/astra-laptop-welcome.log) | 1200×640, DPR 1, `#t=12`, reduced motion; `--legend` supplied | Supported compact frame works; static sail crowding is conspicuous left of Pharos; foreground pine is an obstructive dark shape | **PASS**, settled static: full; 191 calls, 325,690 triangles, 194 geometries, 42 textures. The saved frame does not show an open legend; it is not modal UX evidence |
| [Tether record](../outputs/astra-selection.png) · [log](../outputs/astra-selection.log) | 1600×1000, DPR 1, `#sel=ship.usdt-tether&t=18`, reduced motion | Record is legible; the chosen ship is not an obvious visual focal point in the crowded scene, warranting selection-framing verification | **PASS**, settled static: full; 223 calls, 335,401 triangles, 214 geometries, 43 textures |

Animated gates swept 16 overlapping windows over approximately 12.1 seconds each. That establishes short steady-state pacing on this machine, not a session-long or cross-device guarantee. Static captures have no continuous RAF and no meaningful fps. The day draw census reconciled exactly: 247 attributed calls versus 247 `renderer.info` scene-frame calls, plus two recurring offscreen calls. The log's separate `fleet 11` field is not the ship population; the explicit fleet count is 185.

Two additional measurements support the engineering findings:

- Default hit-target construction cost **6.1–7.2 ms** in these previews, versus approximately **2.3–3.1 ms** for draw submission. An isolated 20-run Node/tsx probe of seven-body `seaSignSites()` measured **6.26 ms median / 7.88 ms p95**. This is CPU evidence, not GPU timing. Selection mode, which skips stele target construction, reported approximately 0.4 ms for hit targets.
- Focused data/API/cache/proxy tests passed **7 files / 122 tests**. Separate executable probes reproduced retained live metadata staying `fresh` after two hours and an interrupted projected upstream body escaping the proxy handler. Existing passing tests therefore do not cover the proposed corrections adequately.

Scratch captures and logs belong in `outputs/` and should not be committed. Record source revision, fixture identity, camera, time, DPR, motion and quality alongside subsequent comparisons. Historical documents contain several different resource snapshots; use a fresh measured tuple rather than treating any old count as current headroom.

The plan's documentation validation passed (`npm run validate:docs`), with nine pre-existing non-blocking documentation-age warnings. The new file was separately checked for whitespace errors. Application code, dependencies and deployment state were unchanged.

## 3. Preserve what is already working

- Keep one imperative Three.js/WebGL renderer and one route-owned animation clock. The current dependency set is pinned, including Three 0.185.1, postprocessing 6.39.4 and N8AO 2.0.0.
- Keep the HDR half-float composer, 4× MSAA plus SMAA, N8AO, restrained depth-band blur, half-resolution shadow-derived god rays, AgX, phase LUT and dithering. These already exist in `src/three/garden-post.ts`; proposals to “add bloom/AO/DOF/color grading” would duplicate delivered work.
- Keep the shared sun/weather/day phase, PMREM environment and spherical-harmonic lighting, derivative-filtered water glints, persistent wakes, and global fleet/harbor batches. The rendering vocabulary is already rich.
- Keep the authoritative terrain, seven-water classification, safe motion field and shared display sample. A softer visual boundary must not change a risk assignment or move a hit target away from its ship.
- Keep the finite, asymmetric, sea-first garden; quiet open water; beacon dominance at night; and the existing one-in/one-out attention rule. Every new detail should replace or demote a named existing element.
- Keep every analytical fact available in details and the accessibility ledger, including stale/missing evidence. Decorative changes must not imply new risk methodology.
- Preserve the screen **and** viewport size gate, both sorted-dimension profiles, and zero world/data/model/logo loading when blocked. Do not substitute orientation gating or propose a mobile WebGL mode.
- Preserve same-origin `/api/*`, the server-only API secret, checked same-origin assets, resource disposal, and workflow-owned releases.

The Ethereum Mole, distributed harbor ring, differentiated station forms and facade work are already implemented. `agents/epic-harbor-plan.md` still describes itself as unimplemented; do not restart that work from its stale status. Any further architecture work should be judged against today's captures and source.

## 4. Graphics and composition refinements

### G1 — Make the seven waters one continuous surface

**P1 · M · visually observed and source-confirmed.** This is the highest-impact rendering refinement.

At night, the region edges look like adjacent polygonal sheets. Below the Circle sail and to the right of the lighthouse, a stepped line abruptly changes the surface response. This breaks the illusion more than a missing high-end effect would.

`src/systems/garden-sea-regions.ts:133` samples classification using floored tile coordinates. Its 512² field still encodes a tile staircase. `src/three/garden-water.ts:99` correctly uses nearest filtering for categorical IDs; the separate distance field already uses linear filtering and mipmaps. The problem extends beyond tint: vertex flow/swell/chop switch by ID around line 485; normal direction and amplitude around line 675; signature normals around line 734; and reflectivity at line 963. Only some color/depth terms are faded at the boundary. The bank/foam treatment around line 1006 further emphasizes the switch.

**Implementation:** move the existing continuous boundary weight early enough to ease every regional deviation toward a common subdued seam state in both vertex and fragment stages. Include swell, directional normal contribution, signature ripples, reflectivity and bank strength. Keep region interiors visibly different. Reduce the strongest contrast exactly at the categorical boundary. This replaces discontinuous regional shading; it adds no new water vocabulary.

Start with that existing distance field. If a visible tile contour remains, build presentation-only continuous boundary weights within a narrow band. Do not interpolate numeric IDs, merely increase texture resolution, or independently warp the apparent geography. Those approaches either leave the cause intact or invent misleading classifications.

**Acceptance:** unchanged tile classifications, route safety and DOM labels; continuous night surface at landing/overview/inspection; calm and danger interiors remain distinguishable; no boundary crawling during slow pan; no meaningful pacing regression. Review reduced motion and lower tiers as well as full quality.

### G2 — Compose reduced motion deliberately and resolve berth crowding

**P1 · M–L · visible crowding, with a confirmed contributing source path.**

Static laptop and whole-map captures pile many branded sails into small berth neighborhoods. Individual logos become a wall of overlapping signs. Quiet motion does not help a static image if its composition is congested.

`src/systems/motion-sampling/reduced-motion.ts:85` chooses the primary/home dock for ordinary routes with a dock stop; Ledger Mooring has its own representative policy. The sample is marked idle. `src/systems/motion-sampling/sea-room.ts:83` disables separation for reduced motion. The subsequent display transform also matters: `src/systems/garden-observatory-slice.ts:280` treats idle differently from berth-bound motion and caps displacement. Therefore the final visible positions are not simply the raw berth coordinates, and changing a single mooring offset is insufficient.

**Implementation:** author a deterministic representative fleet distribution using existing safe risk/rest/berth positions. Preserve Ledger behavior, squad relationships, route meaning and capacity. Trace sampler → display transform → renderer/hit target/detail together. A fixed, coherent sample of the existing choreography is a starting candidate; it must settle directly, with no hidden simulation warm-up and no continuing RAF. Add a small number of stable berth slots only where screen-space silhouette evidence shows they are needed.

For normal motion, inspect dense arrival/rest states before changing placement. There is a concrete spacing weakness to address at assignment: `src/systems/pharosville-world/stages/dock-assignment.ts:82` rejects only an exactly occupied tile, while its candidate lanes around line 104 are one tile apart. Shore clearance accounts for hull size, but neighboring occupied berths do not receive that same envelope. Reuse existing hull/silhouette dimensions for inter-berth clearance, with deterministic ordering and safe fallback when a cove fills.

Introduce a screen-space overlap diagnostic for dominant sails and selected ships in the review harness; do not run a new screen-space packing solver every frame. Adjust safe authored spacing/headings where evidence warrants it. Preserve intentional depth overlap and asymmetric groups: the target is unreadable logo stacks, not zero overlap. Avoid shrinking major coins or hiding ships to make the picture less crowded.

The footer's “142 of 185 hold a berth” counts ships with `dockVisits`, at `src/pharosville-world.tsx:1298`; it is not an instantaneous moored count. Consider the clearer wording “142 have harbor ties.” The animated schedule at `src/systems/motion-planning.ts:319` gives dock rest R, total voyage time 2V, risk rest 2R−2V, and thus a total cycle of 3R: its one-third dock dwell is internally consistent. This is a temporal route property, not an exact population split in every frame. Do not infer that contract is broken from the footer.

**Acceptance:** every eligible ship remains individually represented and selectable; stable input gives an identical static tableau; the selected sail is easy to locate; local crowding improves at 1200×640 and overview; water safety and all sample consumers agree; zero continuous RAF. Update the documented representative-static policy alongside its tests.

### G3 — Give the foreground niwaki a convincing silhouette

**P1 · M · visually observed and source-confirmed.**

The near-black pole and stacked plates below the lower-left fleet are a pine, not a broken reflection. `src/three/garden-rim-mesh.ts:523` builds the ordinary pine from a straight trunk and three flattened sphere pads; around line 592 one instance is enlarged 4× and leaned approximately 0.52 radians. A background-tree recipe becomes an 18-unit foreground hero.

**Implementation:** replace that hero silhouette with a bent/articulated trunk, a few readable branches and unequal foliage lobes, using the existing batching/material approach. First tune silhouette and placement at thumbnail size. Place the foliage so it frames the water instead of obscuring major sails; adding needle texture cannot solve the current form. If a dedicated hero geometry is necessary, use one modest procedural mesh and account for the small cost explicitly rather than degrading every ordinary pine.

**Displacement:** replace the current enlarged pine and its rigid pads; add no extra foreground tree. Retain the engawa's framing role.

**Acceptance:** immediately recognizable as a tree in day/night silhouettes; visible negative space between branches; no opaque trunk/pad overlap through the selected or dominant vessel; no dense foliage wall at compact height.

### G4 — Replace repetitive shore bands with authored terrain transitions

**P1/P2 · M · visually observed and source-confirmed.**

The rim resembles uniformly terraced construction. This is authored, not a lack of polygon density: `src/three/garden-rim-mesh.ts:333` floors height into 0.34-unit increments, while line 43 already uses a dense 0.44475 tile sampling step. Independent cell quads and flat shading reinforce the bands.

**Implementation:** retain deliberate shelves and rock ledges, but vary their spacing and continuity. Use smoother earth between ledges, several distinct outcrop silhouettes, and broad vertex-color transitions for earth/moss/wet rock. Concentrate visible refinement on the camera-near lobes. Keep the rim field and conservative water exclusion authoritative; presentation changes must not make traversable water look like solid land.

**Displacement:** demote the uniform quantized contour pattern. No terrain engine, erosion simulation, new texture library, or general tessellation increase.

**Acceptance:** a hand-shaped miniature landscape reads at default scale; the repetitive contour striping recedes; silhouettes retain the irregular rim and two openings; stations and path clearances remain valid. Keep purposeful low-poly form instead of globally smoothing everything.

### G5 — Restore material character within existing batches

**P2 · M · source-confirmed opportunity; tune through controlled A/B captures.**

The lighthouse has fine architectural hierarchy, while many large hulls and other surfaces read as similarly matte painted blocks. Part of this is intentional stylization; part is information discarded by batching.

`mergeGardenHeroStatics()` in `src/three/garden-ships.ts:1246` preserves vertex color and glow, then rebuilds all hero solids with roughness 0.84, default metalness 0 and flat shading around line 1298. Audit source GLB materials before changing this: carry only distinctions that actually exist or are deliberately authored.

**Implementation:** retain compact per-vertex roughness/metalness values in the existing merged solid draw, following its current glow-attribute pattern. Let timber remain diffuse and selective metal trim respond to the existing environment. Improve a few broad edge/reveal accents where visible; keep fine surfaces quiet. Review sail curvature and logo contrast against the current atlas before adding any fabric texture.

For buildings, first tune existing stone/timber/wall/roof buckets and the already-delivered chamfer/reveal work. A whole new architectural kit is unnecessary. Prefer better roof-to-wall value separation and selective contact darkness over more geometry everywhere.

**Displacement:** replace the blanket material response; avoid a global saturation or sharpening lift. More luster must not turn fittings into competing night lights. Three's existing standard material already provides the needed roughness/metalness behavior. [Three.js material reference](https://threejs.org/docs/pages/MeshStandardMaterial.html)

**Acceptance:** wood, stone, cloth and selected metal read differently under the same light; no new hero draw count or texture inventory; logos remain legible; source/fallback models remain aligned; overview is no noisier.

### G6 — Reconcile reflections and grounding with the fixed camera and shared sun

**P2 · S–M · coordinate inconsistencies confirmed; visual correction requires isolated comparison.**

The tower reflection in `src/three/garden-water.ts:1242` uses one water-local axis for its column. Hero reflections in `src/three/garden-hero-reflections.ts:156` explicitly use the `(1,0,1)/√2` ground direction so they descend vertically in the fixed isometric image. These should share a projection-derived basis.

Ship contact discs also have a fixed `+0.7 X, +0.85 Z` offset at `src/three/world-renderer.ts:4585`, despite a comment describing a light-dependent offset and the now-moving sun.

**Implementation:** align painted mirror columns to one explicit camera basis. Either center contact discs as intentional ambient grounding or derive their small directional offset from the shared sun. Review them as grounding cues, without adding true shadow passes for the fleet. Keep existing region reflectivity meaningful.

**Acceptance:** tower/hero reflections agree in projected direction; no apparent detached hulls; grounding stays soft across dawn/noon/dusk/night. Use isolated debug captures to distinguish the tower mirror, moon road, beacon pool and hero streaks before tuning.

### G7 — Improve the reading hierarchy of signs, haze and selection

**P2 · M · visual/art-direction work, with specific follow-up verification.**

At whole-map scale, steles enlarge into substantial rectangular signs, while at landing scale their narrow lettering can be hard to read. Night carving and foam have more contrast than many architectural details. Preserve naming, but make the stone support feel less like a label board.

Use `src/three/garden-sea-sign-siting.ts` and `src/three/garden-sea-signs.ts` to tune carved-letter width, spacing and stone contrast together. The current overview scale jumps between authored rungs of 1 and 3.2; do not change only the rendered geometry, because hit extents consume the same scale track. Prefer quieter stone mass with readable lettering over larger slabs or stronger glow.

In the Tether deep-link capture, the record is easy to read but the selected vessel is not an obvious subject. `src/hooks/use-world-url-state.ts:107` requests follow for selection without an explicit camera; this is not intentionally a “panel only” link. Verify the ready-frame camera/selection relationship, safe panel margins, and selected sail visibility under reduced motion before diagnosing a specific camera bug. Use the existing focus/attention mechanism to establish the subject; do not add an always-on outline around the fleet.

Finally, retune local light/value separation only after G1/G4/G5. The noon frame has a subdued, somewhat uniform finish; indiscriminately increasing exposure would damage the successful night hierarchy. Verify haze depth and color-space ownership before adjusting the grade. Final output conversion should remain singular and coherent with the composer. [Three.js color-management guidance](https://threejs.org/manual/en/color-management.html)

**Displacement:** reduce sign support/foam/background competition so the selected ship and Pharos receive attention. Keep the large calm region visible when reviewing the scene at thumbnail scale and under the documented blur audit.

### G8 — Improve temporal polish only where artifacts are demonstrated

**P3 · bounded prototypes, not committed feature scope.**

- **Depth-aware blur:** the current depth-band effect protects sharp subject pixels but blurs color conventionally (`src/three/garden-post.ts:740`). This can bleed foreground color into blurred background. Inspect masts against bright water first. If a halo is visible, add conservative depth weights to the existing half-resolution blur; otherwise keep it.
- **Overview LOD transitions:** `src/three/garden-overview-lod.ts:185` eases a shared detail value, but whole-ring batches switch visibility rather than fading. Inspect a slow zoom across the threshold for a whole-ring pop. Do not introduce noisy dithering or transparent sorting merely to fix a pop that has not been observed.
- **More descriptive hero reflections:** only after G6, test a simple silhouette-derived reflection for one focal ship as a replacement for its generic streak. Stop if it reads worse at ordinary scale or disturbs open-water quietness. A planar reflection/SSR system is not the default solution.

Each prototype must name its removed/replaced effect, preserve lower-tier/static composition, and show an actual improvement in matched GPU captures before being retained.

## 5. Correctness and performance foundations

### E1 — Stop solving static sea-sign placement every frame

**P1 · S · measured.**

`src/hooks/use-world-render-loop.ts:760` constructs a fresh hit snapshot after rendering. `src/renderer/garden-observatory-hit-testing.ts:162` calls `seaSignSteles(world.areas)`. That calls `seaSignSites()` at `src/three/garden-sea-sign-siting.ts:336`, which scans each body's tiles and tests the maximum-scale footprint against terrain around line 294. There is no siting cache on this path.

The geometry's position is static for a given ordered area set. Re-solving it costs approximately six milliseconds on the reference machine. This is a direct opportunity to buy interaction headroom while retaining all pixels.

**Implementation:** cache the immutable stele specification by the existing immutable areas reference, at the shared function used by scene and hit testing. Use the codebase's established WeakMap pattern; return/read it as immutable. Preserve input ordering, which affects separation. Continue projecting those sites and updating moving ship targets from the current camera/sample every frame. Do not lower hit-test cadence or fork the siting algorithm.

**Acceptance:** shared scene/target positions remain exact across zoom, camera and area replacement; repeated identical area input does no placement search; changed areas invalidate correctly; removed worlds are collectable. Aim for default hit-target work below 1 ms on this same machine, treating that as a measured target, not a promised result. Re-run dense and selected-outsider target correctness.

### E2 — Remove undefined shader ramps

**P1 · S · source-confirmed portability defect.**

Literal reversed-edge `smoothstep` calls occur at `src/three/garden-water.ts:990`, `garden-sky-billboards.ts:205,229,230,231`, `garden-sky.ts:379,400,407,561`, and `garden-beacon-fire.ts:435`. GLSL leaves `edge0 >= edge1` undefined; a good Metal frame does not establish behavior on other drivers. [Khronos GLSL ES specification](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf)

Replace descending ramps with `1.0 - smoothstep(low, high, value)`. Inspect computed-edge calls too. Add one small shader-hygiene check and compile the affected materials in real hardware previews. Validate sky, cloud shelves, danger rain and beacon fire on another GPU vendor when available. No shader framework is needed.

### E3 — Age retained live data honestly

**P1 · M · reproduced.**

`src/lib/world-payload-cache.ts:148` returns non-restored metadata unchanged. `src/hooks/use-api-query.ts:169` uses that helper for all feeds, and world freshness is derived from it. A fresh response retained during a long outage can continue to report fresh. A probe with a 900-second budget still returned age 0 and status fresh two hours later. The existing test around `world-payload-cache.test.ts:118` enshrines this behavior.

**Implementation:** calculate advancing age for all retained payloads, preserve upstream degradation, and recompute at a coarse visible-page interval or freshness threshold. Do not use the render RAF. Reconcile body `_meta.updatedAt` with response age headers at `src/lib/api.ts:309`, avoiding both ignoring cache age and counting it twice. Reuse existing freshness flags and caveat models.

**Acceptance:** fresh load → failed refreshes → stale threshold updates instrument cues, details and ledger coherently; recovering response restores freshness; paused/hidden tabs reassess on return. Stale evidence must not itself be classified as confirmed dangerous evidence.

### E4 — Bound response-body handling and keep last-good fallback effective

**P1 · M · reproduced.**

The proxy clears its eight-second timeout when headers arrive (`functions/api/[[path]].ts:151`). `projectUpstreamBody()` awaits `upstream.text()` outside its error handler around line 192, and its caller around line 254 does not catch that failure. An interrupted projected JSON body escapes the handler instead of producing controlled fallback. A stalled body can also outlive the intended deadline.

Keep the deadline active through body consumption where projection requires it. Route parse/read failures through the existing last-good response path. Give the client fetch/JSON path at `src/lib/api.ts:279` a bounded cancellation path too, preserving query cancellation. Test header-success/body-stall, body interruption, truncation and caller abort. Do not log credentials or response bodies.

### E5 — Smaller resilience and maintenance work

**P2/P3 · separate localized changes; do not bundle into a renderer refactor.**

| Priority | Finding | Smallest useful refinement and check |
| --- | --- | --- |
| P2 | Production API auto-schema/audit paths are disabled around `src/lib/api.ts:244,260`; restored cache validation checks the envelope rather than all critical payload shape (`world-payload-cache.ts:186`) | Add minimal render-critical shape/finite-value guards, retaining last-good on invalid input. Keep large full-schema work out of the hot path. Test wrong-shaped valid JSON and corrupted same-version storage |
| P2 | Canary freshness problems are deliberately green (`scripts/smoke-live.mjs:297`; `.github/workflows/canary-smoke.yml:32`) | Evaluate existing `--strict-freshness` for scheduled monitoring, independently of deploy tolerance. Detect sustained upstream degradation without adding a monitoring stack or masking brief cadence noise |
| P2 | Custom WeakMap identity IDs and a string memo signature duplicate React dependency equality (`src/hooks/use-pharosville-world-data.ts:81,218,260`) | Replace with explicit dependencies on payloads/freshness/publication state; retain existing world-identity tests and complete-world retention behavior |
| P2 | React error boundary only logs caught errors (`src/components/section-error-boundary.tsx:20`) | Call the existing deduplicated client error reporter. Verify one report and useful keyboard recovery for component/lazy-import failures; consider keeping the small DOM fallback outside a failed world chunk |
| P3 | Normal cache read can throw and normal writes swallow errors (`functions/api/[[path]].ts:233`; `functions/_shared.ts:111`) | Reuse existing edge-cache failure reporting; a failed cache read should still attempt upstream. Test rejection without exposing secrets |
| P3 | Large orchestrators make local ownership harder to see | Extract only a coherent lifecycle/update cluster touched by an actual change. Do not split `world-renderer.ts` into generic managers just because it is long |

## 6. Experience refinements

### U1 — Make focus, visibility and modality agree

**P1 · M.**

Reference panels claim `aria-modal` while background controls remain interactive (`src/pharosville-world.tsx:1101,1116,1141`). The legend's custom focus selector at `src/components/legend-panel.tsx:94` omits `<summary>`, despite the More disclosure at line 246, and its filtering around line 323 does not exclude descendants of closed disclosures.

Prefer styled native `<dialog>.showModal()` for Legend, Changelog and Harbor ledger, replacing duplicated trapping code while retaining the existing visual design. The native modal model provides background inertness and dialog focus behavior; verify restoration and close semantics in this app. Keep ship details nonmodal. [HTML dialog standard](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element)

Separately, `src/components/detail-panel.tsx:84` focuses Close immediately on mount, while `src/pharosville-world.tsx:1091` and `src/pharosville.css:582` keep the panel transparent until the camera rests. It remains tabbable, and child pointer-events are restored at CSS line 596. Reveal, enable interaction and focus together. An already-mounted hidden panel needs genuine hidden/inert state, not opacity alone.

**Acceptance:** no invisible focused or clickable panel; Tab reaches More and its revealed content; hidden disclosure content is skipped; background cannot be operated through a modal; Escape restores the trigger; selection interrupted mid-dolly and reduced motion behave correctly.

### U2 — Make the existing controls discoverable without expanding the chrome

**P1/P2 · S–M.**

Quick Find currently has only the `/` entrance (`src/pharosville-world.tsx:842`). Add a modest Find action in existing footer chrome, with `/` as a hint. Demote Changelog to Legend/About to pay for the extra visible action. Reuse the existing accessible combobox and selection pipeline.

Map Tab traversal can consume every visible target before reaching controls (`src/hooks/use-world-keyboard-targets.ts:40`). Add a focus-visible skip-map action or explicit entry into target traversal. Preserve access to every entity.

Replace one first-visit sentence with practical orientation, for example: “Each sail is a stablecoin; the lighthouse gathers the stability reading. Select a ship or Find one by name.” Remove the unconditional “ledger is current” claim at `src/pharosville-world.tsx:1036`. Derive any current/stale assertion from E3; use a quiet freshness indicator beside Harbor ledger, not a new warning modal.

**Acceptance:** a first-time pointer user can find a named coin; a keyboard user reaches controls without traversing the fleet; onboarding explains the metaphor briefly; partial/cached data never receives an unconditional claim of currency.

### U3 — Let visitors choose the light and choose stillness

**P2 · M.**

The full day-cycle art exists, but half-hour stepping is hidden behind `[`/`]` (`src/hooks/use-world-time-controls.ts:15`; `src/pharosville-world.tsx:859`). The visible switch is essentially binary, and its icon/label follows `nightMode` while a manual hour can override it.

Use the existing light control to disclose a compact native time/range input and Local time reset. Drive the label from effective time/mode, and keep the current URL contract. No new time engine is needed.

Add a Still choice in the same small disclosure, routing through the complete reduced-motion path after G2 is fixed. OS reduced motion remains the minimum preference. The current Observe pause must not be mistaken for pausing the world.

**Displacement:** improve the existing light/Observe control surface; avoid a permanent row of new buttons. **Acceptance:** pointer and keyboard can reach dusk/dawn, reset local time, share the setting, and choose a zero-RAF static composition without changing system settings.

### U4 — Protect reading time and make the ledger easier to use

**P2 · S–M.**

Attract eligibility (`src/pharosville-world.tsx:576`) omits Legend, Changelog, ledger and Quick Find open states. Include them and restart idle eligibility on close so the camera does not begin its postcard tour while someone is reading.

The visible ledger reuses the canonical analytical surface, which is good, but renders a long noninteractive document (`src/components/harbor-ledger-panel.tsx:76`; `accessibility-ledger.tsx:438`). Add section jumps, concise entity summaries, native disclosures and Select in harbor actions. Keep all source/provenance detail and one fact model. Start without a second search/filter system.

Observe already has authored data beats (`src/systems/observe-sequence.ts:67`). Explain HHI as concentration, name “largest percentage change” explicitly, and include existing dollar/size context and relevant freshness caveats. Do not quietly change ranking methodology for a more dramatic tour.

**Acceptance:** reference panels stay visually still beyond two minutes; readers can reach a named record and its world location without scrolling through every entity; tour captions explain what was ranked and how current the evidence is.

## 7. What “state of the art” should mean here

For this project, the useful frontier is **temporal coherence, material response, composition and reliable interaction under a bounded cost**. The existing rendering stack already supplies many techniques usually proposed in a generic graphics upgrade.

| Technique | Decision | Reason / prerequisite |
| --- | --- | --- |
| Continuous regional shading weights | Adopt in G1 | Fixes an observed discontinuity using existing fields and shaders |
| Per-vertex material parameters in merged geometry | Adopt selectively in G5 | Preserves batching while recovering material distinctions |
| Better authored hero silhouettes | Adopt in G3/G4 | More visible at actual viewing scale than another screen-space effect |
| HDR/MSAA/SMAA, AO, AgX/LUT, PMREM/SH, restrained DOF/god rays | Retain and tune | Already implemented; the current AA choice has prior real-GPU A/B evidence |
| Depth-aware blur | Conditional G8 | Only if a halo is reproduced at a meaningful camera pose |
| Async GPU timing | Debug-only before expensive experiments | Frame pacing and draw-submit time cannot isolate GPU pass cost. Use WebGL2 timer queries where supported, discard disjoint samples and report unsupported explicitly. [Khronos timer-query specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/) |
| Dirty ranges for fleet instance buffers | Conditional P3 | `garden-fleet-batch.ts:1430` marks many attributes dirty each frame. Separate static from dynamic updates only if uploads matter in a profile; use the existing API. [Three.js BufferAttribute](https://threejs.org/docs/pages/BufferAttribute.html) |
| Memory budget by estimated bytes | Add to measurement before more targets | Texture count alone does not express resolution, format, depth or MSAA allocation. Estimate owner bytes and keep counts; do not present estimates as measured driver VRAM. [Three.js render-target reference](https://threejs.org/docs/pages/RenderTarget.html) |
| WebGPU/TSL migration | Defer | Prior isolated spike was a measured no-go; no current feature requires a production backend change |
| TAA, full-scene SSR, ray tracing, volumetric cloud raymarching | Defer | Additional temporal/history/memory cost without a demonstrated need in this locked isometric garden |
| More bloom, stronger bokeh, blanket 4K/PBR textures, more particles | Reject as a default refinement | Competes with legibility and quietness; modern technique does not automatically improve this image |

Do not add a dependency for any recommended first-wave work. Do not raise resource or bundle caps to make a prototype pass. New offscreen work must appear honestly in diagnostics, including episodic cost that sits outside the scene census.

## 8. Delivery sequence and acceptance gates

Implement in small reviewable changes, keeping code correctness separate from aesthetic acceptance where practical. Estimated effort classes describe scope, not calendar commitments.

| Wave | Work | Dependency / stop condition |
| --- | --- | --- |
| **A — Trust and headroom** | E1 siting cache; E2 shader ramps; E3 retained-data aging; E4 body failures; U1 focus/modality | Localized fixes first. Tests reproduce the defect before the fix. No intended visual redesign except removal of artifacts |
| **B — Connected, composed garden** | G1 water continuity; G2 static fleet; G3 foreground pine; G4 rim | Capture a fresh matched baseline after A. Review each visual change independently; stop adding detail once silhouette/continuity is clear |
| **C — Material and reading polish** | G5 materials; G6 reflections; G7 signs/selection/value hierarchy; U2 Find/orientation | Preserve B's negative space. Resolve deep-link framing evidence before embellishing the selected subject |
| **D — Visitor agency and maintenance** | U3 light/Still; U4 reading/ledger; selected E5 fixes | Still depends on G2. Keep controls compact; monitoring changes remain separate from visual delivery |
| **Optional experiments** | G8; debug GPU timing; measured upload/memory improvements | Require a named artifact/bottleneck and an A/B result. Delete unsuccessful experiments; no dormant production switch |

### Reproduction commands for this review

```bash
npm run preview -- --assert --hash '#t=12' --draw-census --out astra-day.png
npm run preview -- --assert --hash '#t=22' --out astra-night.png
npm run preview -- --reduced --hash '#t=18&cam=0,0,0.28' --out astra-dusk-overview.png
npm run preview -- --assert --reduced --width 1200 --height 640 --legend --hash '#t=12' --out astra-laptop-welcome.png
npm run preview -- --assert --reduced --hash '#sel=ship.usdt-tether&t=18' --out astra-selection.png
```

The live feed may change these images. For implementation acceptance, use deterministic API data through the established test infrastructure and the supported real-GPU preview path; do not compare different feeds as if they were matched visual tests.

### Required implementation checks

- Run the smallest relevant tests while iterating: motion/world tests for G2; water/renderer tests for G1/E2; siting/hit-target tests for E1; API/cache/proxy tests for E3/E4; component/browser focus checks for U1/U2. Add regression checks for behavior, not tests that merely repeat constants.
- Use `npm run validate:changed` for mixed changes, and the repository's renderer visual/perf lanes when presentation or cost moves. Browser correctness tests are assertions, not authority for visual quality or reference frame times.
- Real-GPU review must include day, dusk, night, static, selected ship/harbor, slow pan and zoom, whole-map, dense fleet and representative stress/weather. Include full and constrained/recovery behavior: palette and analytical truth may not change with quality.
- Check 900×720, 1200×640, a supported tall window, ordinary 1600×1000, ultrawide and DPR 2. Also prove blocked screen/window dimensions make no world-data/model/logo/Three request. The current review measured only the sizes in §2.
- Preserve hard ceilings: **700 calls, 500 geometries, 500,000 triangles, 72 textures**, plus current backing-pixel and bundle caps. Treat today's 42–43 observed textures as a particular session state, not guaranteed headroom over all transitions.
- Keep the real-GPU animated gate at full tier with worst-window p95 ≤20 ms under the reference conditions. Recheck after data refresh, model/logo settling, day-phase changes and overview/inspection crossings; preserve zero continuous RAF in settled static mode. Broaden to a multi-minute session before claiming sustained smoothness.
- Use the documented thumbnail/blur attention audit: a large calm region survives; the beacon remains the dominant night light; added detail does not make every surface equally active. Perform it on real-GPU captures and record the judgment separately from numeric gates.
- Before broad release confidence, run `npm run validate:release`. After an authorized deployment, run `npm run smoke:live -- --url https://pharosville.pharos.watch`. Versioned releases remain owned by `.github/workflows/release.yml` after green main deployment.

## 9. Completion criteria

This refinement succeeds when the water feels connected, the foreground feels intentionally shaped, a selected ship is unmistakable, and static mode offers a balanced garden rather than a congestion map. A visitor should be able to discover a ship, choose dusk or stillness, read its evidence, and return to the view without fighting focus or being misled by old data.

The deliverable is improved visible quality and dependable calm at the existing budgets. An increased effect count, a larger renderer, or a fashionable backend is not a completion criterion.

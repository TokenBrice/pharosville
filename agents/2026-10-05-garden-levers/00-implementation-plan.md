# PharosVille: from harbour diorama to garden observatory

**Main levers and prioritized implementation plan**

- **Date:** 2026-10-05
- **Base:** `main` @ `ccbfca8` (v0.20.1 "Steady Lamp")
- **Status:** **operator decisions settled 2026-10-05** (§4); critiques folded in (§11). Ready to execute from Wave 0.

**Goal (operator):** *a state-of-the-art, relaxing Japanese garden that is also a data visualization of Pharos data.*

**Sources.** This document consolidates three bodies of work, all written by Sol 6.1 agents:

- 20 read-only lens reviews (`evidence/L01–L20`);
- 9 implementation specs (`specs/S1–S9`), each verified against source;
- 3 adversarial critiques (`reviews/C1–C3`).

The specs are the executable detail. This file covers four things: the lever ranking, the operator's decisions, the corrected dependency order, and the gates.

---

## 0. The answer

### The main lever

**Compose one whole-frame hierarchy:** a clearly inhabited Japanese viewing garden, a continuous quiet inlet, a dominant Pharos, and subordinate, unequal fleet masses.

- The largest single intervention is **authoring the garden the visitor sits in** (S1).
  - Today the bottom 25–30 % of the rest frame is a smooth, textureless green bank.
  - The framing pine is three solid cloud-pad discs.
- The fleet's projected masses (S6-P1/P2) and the headland silhouette (S7) are **composition partners**, not later decoration. A beautiful foreground over the old sail "barcode" would not change the category of the picture.

### Why the picture looks the way it does

The weak look is **prescribed**, not accidental, and it is not a hardware limit:

- **The bible prescribes it.** `docs/pharosville/VISUAL_INVARIANTS.md:47-57` requires six inward-only pads and "three smooth, textureless, unpickable draws ≤15k triangles".
- **Tests pin it.** `src/three/garden-threshold.test.ts:184-249` locks that recipe in place.
- **The last cycle could not escape it.**
  - It froze every high-impact variable and ran resource-neutral micro-tweaks.
  - Packets A2, B1 and P1 were rejected as indistinguishable (`agents/2026-10-02-visual-upgrade/02-execution-record.md:15-20`).
  - Taste was delegated to an AI orchestrator (`:3-6`).
- **The garden vocabulary exists but is not seen.** Stones, stepping stones, a karesansui bed, maples, bamboo, koi and a tōrō are all in the code. At rest they are tiny, off-frame, or unreadable.

### Ranked levers

| # | Lever | What changes for the visitor | Impact | Effort | Specs |
|---|---|---|---|---|---|
| **1** | **Whole-frame garden hierarchy** | Moss shelves, a recessed gravel interval and a half-buried stone triad. A path that disappears from view (miegakure, "hide and reveal"). A porous kuromatsu (black pine) and a cropped engawa (veranda) edge. Three unequal flotillas with clear water between them. A weathered headland under the tower. | 5 | L | **S1** + S6-P1/P2/P4 + S7-P1/P2 |
| **2** | **Taught chart** | Three readings at a glance: the lighthouse is market stability, the water is the risk band, the leading sails show who leads. Water carries five static surface signatures, with a live key built from real rendered exemplars. About 20 invisible micro-cues move to inspection-only or are retired. One slow, garden-native record: PSI history raked into the gravel. | 5 | L | **S3** + S5-P1/P2 |
| **3** | **Readable light at every real hour** | Night becomes an indigo garden with separated planes instead of a black block. Noon is clear instead of blue-grey haze. Seasons show in shadow length. Six recognizable cloud states. | 5 | L | **S4** |
| 4 | **Destination, then fast iteration** (meta-lever) | An approved destination; a lookdev panel; a look-selection lane; M5 calibration; the triangle spike fixed. | enabler | M | **S9** |
| 5 | **One material language** | Moss, stone, gravel, timber, plaster and tile read as materials, not coloured clay. | 4–5 | L | **S2** |
| 6 | **Pond-quality water** | No checker chop. A recognizable broken tower reflection. Dark, damp shallows. Quiet hull contact. | 4 | M–L | **S5** |
| 7 | **Coast and architecture craft** | An irregular coast on all sides. A roof-led timber and plaster kit. A credible chaseki (tea-house) veranda. | 4 | L | **S7** |
| 8 | **Inhabit** | Task-ready arrival; immediate facts on selection; one ink-and-sheet chrome; an inspectable stroll; living residents; an opt-in basin sound. | 3–4 | L | **S8** |

### What "state of the art" does not mean here

- **No renderer change.** Three lenses (L02, L15, L18) agree the renderer is not the bottleneck.
  - It is already a modern HDR pipeline: Khronos Neutral, N8AO, mip bloom, MSAA plus SMAA, cached PCF, a planar hero reflection, volumetric shafts.
  - At rest it costs 179 calls, 375k triangles, 50 textures and GPU p95 3.2 ms on an RTX 5070 Ti.
  - WebGPU/TSL is **not warranted**: ShaderMaterial is WebGL-only, and a 1,725-line GLSL port has no proven parity.
- **What it does mean:** authored forms, coherent materials and light, and legible data.

---

## 1. How this was produced

- **Real-GPU baseline.** `outputs/holistic/{day,dawn,golden,blue,night,day-chrome,day-1200x640,day-900x720,selected-usdc,overview,reduced}.png` plus metrics JSON.
  - Captured with `npm run preview -- --headed`, live data, 2026-10-05.
  - On this Linux box headless preview fell to SwiftShader through the Chrome wrapper; only `--headed` reached the NVIDIA GPU. TESTING.md does not say this; S9-P5a fixes it.
- **Wave 1:** 20 lens reviews (`evidence/`).
- **Wave 2:** 9 specs (`specs/`). They corrected wave-1 claims against source:
  - the threshold is smooth-shaded, not flat;
  - "DEWS clouds" is stale copy, not runtime behaviour;
  - the triangle spike exceeded the cap by 66,611/74,545, not by "216k";
  - the moonless key light is 0.1, not 0.
- **Wave 3:** 3 critiques (`reviews/`): goal fit, feasibility, and truth/contracts.
- **Scope of writes:** no app source, test or doc was changed. Only `agents/` and `outputs/holistic/` were written.

---

## 2. Diagnosis (evidence summary)

### The picture

**1. No garden at rest** (L01, L05, L06, L07, L15, L16, L18).

| Fact | Evidence |
|---|---|
| The bank is a concave fall plus sine swells | `garden-threshold.ts:156-170` |
| Its colour comes from sine value masks | `:235-263` |
| The largest screen region gets 3 draws and 14,788 triangles | baseline census |
| The engawa is placed off-frame on purpose | `:454-483` |
| Maple and cherry literally call `createNiwakiPine` | `garden-flora.ts:249-261` |
| The karesansui bed is contractually outside the rest frame | `CONTRACTS.md:253-258` |

**2. Toy diorama.** The square 140×140 plate reads as a tray (`overview.png`).

| Fact | Evidence |
|---|---|
| The rim is the minimum distance to the four square edges | `garden-rim.ts:204-213` |
| Decorative skirts extend only south and east, about 4.5 tiles | `garden-rim-mesh.ts:285-302,430-444` |
| The headland is radial benches | `garden-island.ts:330-388` |
| Irimoya roofs are two planar slopes with a box fascia | `garden-docks.ts:1472-1537` |

**3. Material incoherence.** A finely articulated GLB tower stands among roughness-0.98 vertex-colour clay.

| Fact | Evidence |
|---|---|
| The custom GLB parser cannot carry UVs or maps | `garden-models.ts:519-571` |
| Palette drift: honey key and C0.16 | `palette.ts:6-21,55-60` |
| The bible requires neutral noon and C0.12 | VISUAL_INVARIANTS |

**4. Light.**

| Fact | Evidence |
|---|---|
| The noon horizon is mid-blue by policy | `garden-sky.ts:74-77` |
| Far transmittance is fitted to 0.34 | `garden-aerial.ts:114-119` |
| Night fill is ambient 0.06 and hemisphere 0.1 | `garden-day-cycle.ts:184-202` |
| The solar apex is fixed at 0.62 rad on every date | — |
| BEDROCK clouds occupy about 0.3 % of the sky | — |

**5. Water.**

| Fact | Evidence |
|---|---|
| The normal asset is 16 near-symmetric integer sine waves | `generate-water-normals.mjs:42-92` |
| Resampled at three orientations, it produces a checker, visible even in reduced motion | — |
| The hero reflection uses shore-distance LOD plus a symmetric vertical three-tap blur | `garden-water.ts:1096-1113` |

**6. Fleet.**

| Fact | Evidence |
|---|---|
| World-space clustering does not guarantee projected separation, which gives the "sail barcode" | — |
| LOD switches at 150 units distance and keeps the nearest 16 | `garden-fleet-batch.ts:318-346` |
| Size saturates near $23.7B, so the largest leaders tie | — |

### The data

**7. Weak chart grammar (L09).**

- About 28 encodings exist; most cannot be read at rest.
- The reading funnel scores: glance 1/5, understand-why 2/5, inspect 4/5.
- The legend teaches colour swatches, not surfaces.
- Water names are inspection-only (`CONTRACTS.md:243-247`).
- Copy contradicts runtime:
  - deleted audit shields are still taught (`legend-panel.tsx:247-249`);
  - the beam is described as "PSI warmth";
  - "DEWS clouds" is stale.
- Executable financial shape deltas sit unregistered in the cue registry (`ship-visuals.ts:182-239`).

**8. Source failures take over the caption.**

- Any non-current feed replaces the caption with its raw exception (`detail-model.ts:117-143`; `CONTRACTS.md:101-105`).
- Live `/api/mint-burn-flows` currently fails validation. The cause is undiagnosed: the production guard and the persistence Zod are different validators (`api.ts:363-376`; `world-payload-cache.ts:196,258-263`).
- First-visit teaching can be consumed without ever being shown (`use-visitor-line.ts:74-94`).

### The experience

**9. Arrival** is a 9 s hazy rise (`garden-arrival.ts:11-18`) into an unbranded gradient.

**10. Chrome is split.**

- The detail sheet is paper and ink.
- Quick-find, the ledger and the changelog are purple and gold.
- Explore shows `/`, but `/` opens Find.

**11. Camera.**

- Wander forces the view home on any input (K44, `CONTRACTS.md:427-432`; `use-canvas-resize-and-camera.ts:607-626`).
- Selection framing takes the first clear camera candidate; in `selected-usdc.png` half the frame is sky.
- Details wait for 70 % of the glide (`pharosville-world.tsx:484-487`), which contradicts `CONTRACTS.md:301`.

**12. Life.** Natural fish-rings can never be admitted (verified by the orchestrator).

- Generated entries have `windowSec: 0` (`garden-score.ts:452-458`).
- The driver tests `clockSec >= start + window` before it tests `clockSec >= start` (`:657,661`), so every entry expires before it can start.

### Process

**13.** There was no approved destination, no taste checkpoint, and no lookdev loop. Several tests pin the previous art recipe rather than its purpose (L17, L20).

---

## 3. Lever → packet map

- Packet IDs refer to `specs/S<n>-*.md`.
- **Effort:** S ≤2 agent-days, M ≤1 week, L >1 week.
- Packets marked **(split)** were divided by the critiques (§11).
- **Declined** means the operator did not approve it; see §4.

**Lever 1: Whole-frame hierarchy**

- S1-P1 graybox + recipe/texturelessness pin retirement (M)
- S1-P2 moss, substrate, buried triad, disappearing path (L)
- S1-P3 porous kuromatsu (L)
- S1-P4 engawa/eave + night integration (M)
- S6-P1 projected anchorage grammar (L)
- S6-P2 pixel-footprint LOD + leader cast (L)
- S6-P4 resting headings (M)
- S7-P1 four-sided decorative coast (M)
- S7-P2 geological headland + shore descriptors (M)

**Lever 2: Taught chart**

- S3-P1 channel ownership: copy truth plus the approved channel table (M)
- S5-P1 static five-band codebook (M)
- S5-P2 pond optics (M)
- S3-P3 live key + two rest names (L)
- S3-P6 teaching actually seen, without re-teaching v1 visitors (S)
- S3-P4 exact daily PSI record (M)
- S3-P5 gravel trace replacing pine history (M)
- S3-P7 mint-burn investigation and repair (M; effort unknown until diagnosis)
- ~~S3-P2 scoped source health~~ **Declined**

**Lever 3: Light**

- S4-P1 moon-independent night + region-of-interest (ROI) metrics (M)
- S4-P2 analytic daylight transport + PMREM cache key (L)
- S4-P3 sheltered irradiance zones (M)
- S4-P4 seasonal apex (S)
- S4-P5 six recognizable clouds (M)
- S4-P6 PCSS — *only if stabilized PCF fails* (L)

**Lever 4: Enablers**

- S9-P1 destination board + invariant charter (S)
- S9-P2 lookdev panel + inspector (M)
- S9-P3 look-selection lane (M)
- S9-P4 triangle-spike source fix (M)
- S9-P5a baseline M5 calibration + Linux doc fix (M) **(split)**
- S9-P5b final release calibration (S) **(split)**
- S9-P6 doc hygiene (S)
- S9-P7a stale-snapshot removal (S) **(split)**

**Lever 5: Materials**

- S2-P1 texture-free `applyGardenSurface` grammar (M)
- S2-P2 reproducible asset compiler (L)
- S2-P3 GLTFLoader cutover — *only when authored assets are elected* (M)
- S2-P4 three-map atlas; KTX2 requires S2-P3 (L)
- S2-P5 palette reconciliation (M)
- S2-P6 terrain finishes (M)
- S2-P7 architecture/fleet prep (M)

**Lever 6: Water**

- S5-P3 broken hero reflection (M)
- S5-P4 shallow margins (L)
- S5-P5 contact vs mover trails (M)

**Lever 7: Coast and architecture**

- S7-P3a kit authoring (M) **(split)**
- S7-P3b kit adoption into DockRecipe (M) **(split)**
- S7-P4 chaseki/precinct verandas (M)

**Lever 8: Inhabit**

- S8-P5a fish-ring fix (S)
- S8-P1 task-ready arrival + capture instrument (M)
- S8-P2 ink-and-sheet chrome (M)
- S8-P3 inspectable stroll (L)
- S8-P4a immediate facts + panel-aware scoring (M) **(split)**
- S8-P4b station-local restoration (S) **(split)**
- S8-P5 resident life + rooted gust flex (M)
- S8-P6 basin sound (M)
- S8-P7 small-screen edition + og-card (M)

---

## 4. Operator decisions (settled 2026-10-05)

| ID | Decision | Answer | Consequence |
|---|---|---|---|
| D1 | Destination | **A — Moss-side observatory** | S9-P1 produces the annotated A board. S1-P1 builds the A graybox as one complete whole-frame candidate, using S6-P1 descriptors and S7 silhouette input. Macro B is not authored. |
| D11 | Style | **Refined stylized PBR** | S2 direction is fixed. Full NPR, Kuwahara and print overlays are out. |
| D3 | Taste checkpoints | **Operator at destination and final only** | There is no operator graybox checkpoint (see §5.1). |
| R1 | Release shape | **Whole programme, then release** | There is no intermediate release. The integration branch carries everything until final acceptance. |
| D2 | Invariant charter | **Adopted** | §9. Each clause changes only together with its owning packet. |
| D4 | Night | **Readable indigo garden** | Region floors replace the near-black ninth targets: boundary pairs ≥4 L\*, materials ≥3 L\*, ≥90 % of approach pixels ≥ L\*6. The beacon stays dominant; open-water emission ≤0.016. |
| D5 | Water risk | **Static surface signatures** | Forced swell/chop/foam escalation is removed only after the S5-P1 comprehension test passes. |
| D6a | Gravel PSI record | **Approved** | Exact policy: at most 30 UTC daily closes ending on the newest supplied day. Not a rolling average. Gaps and methodology boundaries stay visible. It replaces the analytical pine fullness/browning. |
| D6b | Two rest water names | **Approved** | At most two collision-safe names at rest. The ledger stays complete. |
| D6c | Retire invisible micro-cues | **Approved** | This is the full S3 channel table (`specs/S3-data-grammar.md` §Target). It includes retiring the unregistered grade/backing/yield/NAV proportion deltas (`ship-visuals.ts:223-239`) and moving secondary cues to inspection-only. Every fact stays in the details and the ledger. |
| D7 | Scoped source health (S3-P2) | **Not selected → declined** | Exclusive warning precedence stays (`CONTRACTS.md:101-105`). S3-P7 removes today's live failure once it is diagnosed and repaired. Raw-reason copy at rest stays as it is. |
| D6d | Re-teach v1 "seen" visitors | **Not selected → declined** | S3-P6 fixes future teaching only. No v2 migration of existing visitors. |
| D10 | Fleet | **Projected masses; no leader size bonus; no aggregation** | Keep `clamp(0.42·(cap/1e6)^0.10, 0.42, 1.15)`. One coin is one visible ship. |
| D8 | Navigation | **Six-station stroll** | Replaces K44. Home returns to the seat. Escape or deselection returns to the saved **station-local** pose, not home. Idle never tours. Station plates are included in the final review. |
| Budget (D12/D17) | Budgets | **Earned rebaseline** | JS cap ≤1,024 KiB gzip, earned packet by packet against measured offsets. Fix the triangle spike first. Fund triangles from offsets; rebaseline 480k only on M5 evidence, never above the 500k hard cap. No other cap changes. |
| D9 | Coast | **Up to 18 tiles outboard, all sides** | Classification field, water-plate margin and map bounds are unchanged. |
| D13 | Chroma | **Accepted:** supporting pigments C ≤0.12 | Explicit exceptions for identity, DOM, practical lights and events. The four anchors are untouched. |
| D14 | Season | **Accepted:** bounded apex | Clamped to [0.42, 0.85] rad. Seat azimuth is kept. |
| D15 | Shadows | **Accepted:** PCSS only if needed | Stabilized PCF counts as a completed result. |
| D16 | Arrival and sound | **Accepted:** branded gradient shell; modal-synthesis basin | The basin must pass a blind audition. Sound stays opt-in and is never an analytical carrier. |
| D12a | Loader | **Accepted:** GLTFLoader only when needed | Procedural geometry first. S2-P3 only if a checked GLB or textured asset is actually elected. KTX2 needs its own measured decision. |

**Open item for the operator.** D7 and D6d were left unselected, so this plan treats them as declined. Consequence: until S3-P7 lands, visitors keep seeing "Mint and burn unavailable · Fetch failed: Schema validation failed…" as the only caption. If that is not the intent, re-admit S3-P2. It slots in after S3-P1 and before S3-P3, with no other schedule change.

---

## 5. Execution plan

### 5.1 Ownership, lanes and checkpoints

- **Branches.** Integration branch `feat/garden-observatory`; packet worktrees `feat/garden-*` via `npm run worktree:new`. Operator adoption of this plan explicitly supersedes the old `feat/hour-print` branch/programme clause in `CONTRACTS.md:488-492`. The S9-P1 charter edits that section.
- **Single integration owner.** One owner writes every shared seam from lane-supplied patches, rebasing each before application:
  - `src/three/world-renderer.ts`
  - `src/pharosville-world.tsx`
  - `scripts/pharosville/preview.mjs`
  - `docs/pharosville/{CONTRACTS,VISUAL_INVARIANTS,ASSET_PIPELINE,TESTING}.md`
  - `CHANGELOG.md` and `src/content/pharosville-changelog.ts`

  Merging conflicting worktrees after the fact is not prevention.
- **Serialized file chains.** Packets within a chain never run concurrently, even when they sit in the same dependency layer:

  | Chain | Order |
  |---|---|
  | Threshold | S1-P1 → S9-P2 → S1-P2 → S1-P3 → S2-P6 → S1-P4 → S8-P5 |
  | Water | S5-P1 → S5-P2 → S5-P3 → S5-P5 → S5-P4 |
  | Sky | S4-P2 → S4-P3 → S4-P4 → S4-P5 |
  | Surfaces | S2-P6 → S2-P7 |
  | Fleet | S6-P2 → S6-P4 |
  | Experience | S8-P3 → S8-P5 → S8-P7 |
  | Preview | S9 owns `preview.mjs`. S4 and S8 own the semantics and tests of the flags they need (`--light-rois`, `--cold-filmstrip`, `--experience-state`, `--station`, `--reading-key`, `--source-details`, `--appearance`). S9 applies those patches before the capture acceptance that uses them. |

- **Agents.** Sol 6.1 at medium or high effort, per AGENTS.md; one agent per lane at a time.
  - Each task carries its spec section verbatim and the line "edit only; no gates, formatters or GPU runs", plus a report cap.
  - The orchestrator runs gates and GPU captures **serially**.
- **Operator checkpoints (D3).**
  - **CP-Destination** (after W1). Inputs: the S9-P1 A board plus the S1-P1 production-renderer graybox, built with S6-P1 masses and the S7-P1 silhouette. Shown at 1600×1000, 1200×640 and 900×720; day and night; rest, selection and overview; plus 16 px notan.
    - Geometric evidence and aspirational material overlays are labelled separately.
    - Annotations use local raster or SVG compositing. No generated picture counts as evidence of achievable geometry.
    - The seat is frozen only after this review. Reopen pose/FOV only if the complete candidate fails the rubric at both gates.
  - **CP-Final** (after the last authoring layer). Integrated picture, S9 rubric, reading gate (§8), station plates.
- **Orchestrator graybox gate.** No operator is present at graybox. The orchestrator therefore runs an internal check against the approved A board before detailing (blinded X/Y, 16 px blur). This archives evidence; it is **not** a taste approval. If the graybox cannot meet the board, the orchestrator stops and escalates.

### 5.2 Authoring layers

Layers are computed from every spec `Depends` line plus the critique corrections (§11). They are **authoring windows, not completion claims**. Packets in one layer run in parallel unless they share a chain from §5.1.

```mermaid
flowchart LR
  L0["L0<br/>S9-P1 · S9-P4 · S9-P7a · S3-P1 · S3-P7<br/>S2-P2 · S8-P5a"] --> L1["L1<br/>S1-P1 graybox · S2-P1 · S4-P1 · S7-P1<br/>S7-P3a · S9-P5a · (S2-P3 if elected)"]
  L1 --> CPD{{CP-Destination}}
  CPD --> L2["L2<br/>S2-P4 · S4-P2 · S5-P1 · S6-P1 · S9-P2"]
  L2 --> L3["L3<br/>S1-P2 · S2-P5 · S4-P3 · S5-P2 · S6-P2<br/>S9-P3 · S9-P6"]
  L3 --> L4["L4<br/>S1-P3 · S4-P4 · S5-P3 · S6-P4"]
  L4 --> L5["L5<br/>S2-P6 · S4-P5 · S5-P5 · (S4-P6)"]
  L5 --> L6["L6<br/>S2-P7 · S3-P3 · S7-P2"]
  L6 --> L7["L7<br/>S3-P4 · S3-P6 · S5-P4 · S6-P3 · S7-P3b"]
  L7 --> L8["L8<br/>S1-P4 · S3-P5 · S6-P5 · S7-P4 · S8-P1"]
  L8 --> L9["L9 S8-P2"] --> L10["L10 S8-P3 · S8-P4a"] --> L11["L11 S8-P4b · S8-P5"] --> L12["L12 S8-P6 · S8-P7"] --> L13["L13 S9-P5b final calibration"]
  L13 --> CPF{{CP-Final + reading gate}} --> REL([single release])
```

**Note on S6-P1 and CP-Destination.** S6-P1 is placed in L2, but CP-Destination (after L1) needs fleet masses. Its *placement descriptors* are drafted for the graybox inside S1-P1. The full packet follows once S1-P1 freezes the seat and brow.

**Ordering rules the layers enforce** (from C2 and C3):

1. **Enabler order.**
   - S2-P1 precedes S9-P2, which precedes S9-P3 and S9-P6.
   - S9-P5a (baseline calibration, after S9-P4) precedes any reserve spend; every packet's device acceptance uses its protocol.
   - S9-P5b certifies the release.
2. **S7-P3 is split.** Pure kit authoring (S7-P3a) has no material dependency. Adoption (S7-P3b) waits for S2-P4 and S2-P7. S1-P4 waits for S7-P3b.
3. **The key waits for its exemplars.** S3-P3 waits for S4-P5 (cloud exemplar) and S5-P1 (surface codebook). Exemplars are regenerated and retested whenever S4 or S5 changes their appearance. S3-P3's capture acceptance waits for the S8-P1 capture driver.
4. **Semantic closure.** S5-P1 and S5-P2 cannot pass acceptance before S3-P3's matching actual-shader key, DOM/ledger equivalents and the reading gate. With one release this binds CP-Final, not an earlier cut.
5. **KTX2** requires S2-P3 to have been elected and completed.
6. **Essential experience is not deferred behind the stroll.** S8-P4a (details render immediately; panel-aware tableau scoring) depends only on S8-P2 and S6-P1/P2. Station-local restoration (S8-P4b) waits for S8-P3.

### 5.3 Layer-0 quick wins

Each is independent and small.

| Item | Where | Owner |
|---|---|---|
| Fish-ring admission: named 1 s window, half-open expiry, include window+hold in noon/sunset exclusion | `src/systems/garden-score.ts:452-458` (+ driver tests) | S8-P5a |
| Mint-burn mismatch: **investigate, then make an evidence-backed repair** (see rules below) | `shared/types/mint-burn.ts`, `src/lib/api.ts`, `src/lib/world-payload-guard.ts`, `src/lib/world-payload-cache.ts` | S3-P7 |
| Remove taught audit shields and the test assertion; correct beam/cloud copy | `legend-panel.tsx:247-249`, `legend-panel.test.tsx:82`, `detail-model.ts:275-286,328-334`, `visual-cue-registry.ts:452-453` | S3-P1 (copy part; needs no further approval) |
| Doc drift fixes (list below) | THREEJS_AGENT_REFERENCE.md, CONTRACTS.md:289, TESTING.md | S9-P6 / S9-P5a |
| Delete unreferenced `src/three/.garden-island-g1.ts` and `.garden-islets-g1.ts` after an ownership/history check | — | S9-P7a |

**Mint-burn rules (S3-P7).**

- Work only through the same-origin proxy.
- Run the guard and the Zod schema independently and record `safeParse` field paths.
- Compare against the producer's documented semantics; add a synthetic regression test and a cache-restore test.
- Never loosen validation and never zero-fill.
- `PHAROS_API_KEY` must not appear in the browser, HTML, logs or fixtures. No new endpoint; no upstream credential request.
- Unavailable/held states stay until repaired live data passes both validators and persist/restore.

**Doc drift to fix.**

- AgX → Neutral.
- Divisor 1e7 → 1e6.
- "216k" → 66,611/74,545.
- Linux preview: document `--headed`.
- Water reflection wording: "shore-distance LOD and symmetric vertical three-tap blur", not an "unconditional smear".

Also: the duplicate `pv-panel-enter` rule (`pharosville.css:1402,1428`) is removed inside S8-P2. The og-card is replaced inside S8-P7.

---

## 6. Packet register

Lx is the authoring layer. Each spec's Depends line remains authoritative; this table adds the critique corrections. Every S5 packet additionally needs destination/charter and M5 device acceptance. Every packet that spends reserve needs S9-P4 and S9-P5a.

| Lx | Packet | Effort | Dependencies (direct) | Primary files |
|---|---|---|---|---|
| 0 | S9-P1 board + charter | S | — | PRODUCT.md (root), VISUAL_INVARIANTS.md, CONTRACTS.md (incl. :488-492), CHANGE_CHECKLIST.md, ASSET_PIPELINE.md |
| 0 | S9-P4 triangle-spike fix | M | — | world-renderer.ts, garden-draw-census.ts, renderer-shadow-rig.ts |
| 0 | S9-P7a stale snapshots | S | — | src/three/.garden-*-g1.ts |
| 0 | S3-P1 channel table + copy | M | copy: —; semantic cutover: D6c ✔ | visual-cue-registry.ts, detail-model.ts, legend-panel.tsx, ledger, ship-visuals.ts, world-types.ts |
| 0 | S3-P7 mint-burn repair | M (diagnosis-open) | — | shared/types/mint-burn.ts, api.ts, world-payload-guard.ts, world-payload-cache.ts |
| 0 | S2-P2 asset compiler | L | — (worth deferring until an authored asset is elected; procedural-first does not need it) | compile-garden-assets.mjs (new), glb-meshopt.mjs, garden-models.ts |
| 0 | S8-P5a fish-ring fix | S | — | garden-score.ts (+test) |
| 1 | S1-P1 graybox + pin retirement | M | S9-P1; S6-P1 descriptors; S7-P1 silhouette | garden-threshold.ts (+test), VISUAL_INVARIANTS.md, CONTRACTS.md |
| 1 | S2-P1 material grammar | M | S9-P1 | garden-surfaces.ts (new), garden-aerial.ts, garden-print-inks.ts |
| 1 | S4-P1 moon-independent night | M | S9-P1 | garden-day-cycle.ts, garden-environment.ts, garden-sky.ts, preview-metrics.mjs (+ S9 flag patch) |
| 1 | S7-P1 decorative coast (≤18 tiles) | M | S9-P1 | garden-rim-mesh.ts, garden-horizon.ts |
| 1 | S7-P3a kit authoring | M | S9-P1 | garden-architecture-kit.ts (new) (+test) |
| 1 | S9-P5a baseline M5 calibration | M | S9-P4 | TESTING.md, CONTRACTS.md, preview.mjs |
| 1 | S2-P3 loader cutover *(only if elected)* | M | S2-P2 | garden-models.ts, world-renderer.ts, bundle-budgets.mjs |
| 2 | S2-P4 surface atlas | L | S2-P1, S2-P2, S9-P5a; S2-P3 for KTX2 | garden-surface-atlas.ts (new), compiler, world-renderer.ts |
| 2 | S4-P2 daylight transport | L | S4-P1 | garden-atmosphere.ts (new), garden-sky.ts, garden-aerial.ts, garden-environment.ts |
| 2 | S5-P1 surface codebook | M | S3-P1, S4-P1 | garden-sea-regions.ts, garden-water.ts |
| 2 | S6-P1 anchorage grammar | L | S1-P1, destination/charter | garden-fleet-footprint.ts (new), garden-fleet-placement.ts, observatory-slice |
| 2 | S9-P2 lookdev + inspector | M | S9-P1, S2-P1, S1-P1 | garden-appearance.ts (new), src/dev/garden-lookdev.tsx (new), world-renderer.ts |
| 3 | S1-P2 ground/stones/path | L | S1-P1, S2-P1, S9-P2; exports the gravel inset descriptor | garden-threshold.ts, garden-set-stones.ts |
| 3 | S2-P5 palette | M | S2-P1, S4-P2, destination | palette.ts (+test), VISUAL_INVARIANTS.md |
| 3 | S4-P3 irradiance zones | M | S4-P2, S2-P1, S1-P1 | garden-irradiance.ts (new), garden-print-inks.ts |
| 3 | S5-P2 pond optics | M | S5-P1 | generate-water-normals.mjs, water-normals.png, garden-water.ts |
| 3 | S6-P2 footprint LOD | L | S6-P1, S3-P1 | garden-fleet-batch.ts, garden-ships.ts, hit-testing |
| 3 | S9-P3 look-selection lane | M | S9-P2 | preview.mjs, preview-manifest.mjs, look-selection.mjs (new) |
| 3 | S9-P6 doc hygiene | S | S9-P1, S9-P2 | THREEJS_AGENT_REFERENCE.md, CONTRACTS.md, ASSET_PIPELINE.md |
| 4 | S1-P3 kuromatsu | L | S1-P1, S1-P2 (chain) | garden-niwaki.ts, garden-threshold.ts |
| 4 | S4-P4 seasonal apex | S | S4-P2, S4-P3 (chain), charter | garden-sun.ts |
| 4 | S5-P3 hero reflection | M | S5-P2, S4-P1, S4-P2 | garden-water.ts, garden-hero-reflection-pass.ts |
| 4 | S6-P4 resting headings | M | S6-P1, S6-P2 (chain) | motion-planning.ts, mooring.ts, reduced-motion.ts |
| 5 | S2-P6 terrain finishes | M | S2-P1, S2-P4, S2-P5, S1-P3 (chain), charter | garden-threshold.ts, garden-island.ts, garden-rim-mesh.ts |
| 5 | S4-P5 cloud codebook | M | S4-P2, S4-P4 (chain), S3-P1 | garden-sky.ts, psi-sky.ts |
| 5 | S5-P5 contact vs trails | M | S5-P3 (chain), S6-P4 | garden-wakes.ts, renderer-ship-frame.ts |
| 5 | S4-P6 PCSS *(conditional)* | L | S4-P3, S4-P4, S1-P1, S9-P4, S9-P5a | renderer-shadow-rig.ts, garden-contact-shadows.ts (new) |
| 6 | S2-P7 arch/fleet prep | M | S2-P1, S2-P4, S2-P5, S2-P6 (chain); release sign-off S9-P4/P5 | harbor-batch, fleet-batch, ships, precinct, flora |
| 6 | S3-P3 live key + two names | L | S3-P1, S5-P1, S4-P5; capture acceptance after S8-P1 | legend-panel.tsx, reading-key.ts (new), garden-sea-signs.ts, public/garden-reading-atlas.webp |
| 6 | S7-P2 geological headland | M | S7-P1, S2-P6, S4-P1 | garden-island.ts, garden-rim-mesh.ts |
| 7 | S3-P4 daily PSI record | M | S3-P1, S3-P3 | garden-month-record.ts (systems), world-scaffold, detail/ledger |
| 7 | S3-P6 seen teaching (no v1 re-teach) | S | S3-P3 | use-visitor-line.ts, pharosville-world.tsx |
| 7 | S5-P4 shallow margins | L | S7-P2, S2-P1, S2-P4, S5-P5 (chain) | garden-water.ts, garden-sea-edges.ts |
| 7 | S6-P3 vessel exemplars | L | S6-P2, S2-P1, S2-P7, destination | garden-ships.ts |
| 7 | S7-P3b kit adoption | M | S7-P3a, S2-P4, S2-P7 | garden-docks.ts, harbor-batch |
| 8 | S1-P4 engawa + night | M | S1-P2, S1-P3, S7-P3b, S2-P1, S2-P6, S4-P1, S4-P3, S9-P5a | garden-threshold.ts |
| 8 | S3-P5 gravel trace | M | S3-P4, S1-P2 (inset), S2-P1, S2-P4 | garden-month-record.ts (three), world-renderer.ts |
| 8 | S6-P5 slack cloth | M | S6-P3, S6-P4 | fleet-batch, ships, renderer-ship-frame |
| 8 | S7-P4 chaseki/precinct | M | S7-P2, S7-P3b, S2-P7, S4-P1, S4-P3 | garden-island.ts, garden-precinct.ts, keeper, summit-birds |
| 8 | S8-P1 arrival | M | S3-P3, S3-P6, S9-P2, charter | index.html, client.tsx, garden-arrival.ts, **public/_headers**, preview.mjs (via S9) |
| 9 | S8-P2 ink-and-sheet chrome | M | S8-P1, S3-P3 | pharosville.css, world-controls, quick-find, ledger |
| 10 | S8-P3 stroll | L | S8-P2, S1-P3, S7-P4 | postcards.ts, camera hook, camera-intent.ts |
| 10 | S8-P4a immediate facts + tableaux | M | S8-P2, S6-P1, S6-P2 | camera.ts, camera hook, detail-panel.tsx, pharosville.css |
| 11 | S8-P4b station-local restoration | S | S8-P4a, S8-P3 | camera hook, camera-intent.ts |
| 11 | S8-P5 life + gust flex | M | S8-P3 (chain), S1-P3, S1-P4, S7-P4, S4-P1 | koi, heron, flora, threshold, world-renderer |
| 12 | S8-P6 basin sound | M | S8-P5, S7-P4 | pharosville-audio/{bed,engine,mix,scene-snapshot}.ts |
| 12 | S8-P7 stills + og-card + small screen | M | S8-P5 (chain), S1-P4, S4-P2, S7-P4, S9-P5a, destination | client.tsx, desktop-only-fallback.tsx, **public/_headers**, generate-garden-social.mjs (new) |
| 13 | S9-P5b final calibration | S | everything | TESTING.md (evidence) |

**Additional requirements for S8-P1 and S8-P7** (C3 #5):

- **Files and tests.** Include `public/_headers` and the existing CSP/security contract coverage.
- **First-byte shell.** Identity, encoding guide and analytics links must survive no-JS and module failure. They carry no live readings and no fake progress stage; stage updates need observed readiness.
- **CSP.** Use stylesheet classes only: no inline handlers, no inline style blocks, no `unsafe-inline`. Any change to script bytes updates the exact hash, the policy docs and the tests.
- **Size gate.** Test the sorted device and viewport profiles (900×720 and 1200×640), their rotated companions, and shrink/remount at the boundary. Blocked cases must request no world, API, GLB or logo resources.
- **Stills.** Stills are labelled as illustrations, and only the chosen crop loads.
- **Renderer failure.** The selectable WorldStaticOverview stays as the fallback.

---

## 7. Budgets: the binding constraints

**Baseline**, verified in `outputs/holistic/day.json` (RTX, live data, 2026-10-05):

| Resource | Rest baseline | Acceptance target | Hard cap |
|---|---|---|---|
| Calls | 179 | 275–285 | 700 |
| Geometries | 179 | — | 500 |
| Triangles | 374,708 | 480k | 500k |
| Textures | 50 | 60 | 72 |
| JS gzip | 948 KiB (last release) | — | 963 KiB |

GPU p95 at rest was 3.17 ms.

**Projected from spec ceilings** (estimates, not measurements):

| Resource | Projection | Note |
|---|---|---|
| Calls | +9–11 → **188–190** (main colour pass) | Ample. Submitted shadow/reflection increments need a census. |
| Triangles | 374,708 + 60,500 (S1, includes shadow redraw) + 44,000 (S7, includes shadow/main allowance) + 8,000 (S6) + 400 (S8) + 128 (S3-P5) = **487,736** | Before unpriced activation/pass costs; the two now-visible rest water names (S3-P3) also add submitted triangles. **≥7,736 of measured offsets are needed to reach 480k.** Candidate offsets: S6-P2 LOD, the S7-P1 painted-ridge removal. |
| Textures | S2 +3 −2, S3 +≤1 (sea-sign ink atlas), optional S7 +1 | **51–53 final, up to 55 transitional.** Fine. |
| JS gzip (procedural path) | — | **1,000.5–1,009.5 KiB** |
| JS gzip (+ GLTFLoader) | — | **1,020.5–1,049.5 KiB** |
| JS gzip (+ GLTFLoader + KTX2) | — | **1,030.5–1,069.5 KiB** |

**Policy (operator Budget decision):**

1. **JS: earned rebaseline, ≤1,024 KiB gzip.**
   - The procedural path fits.
   - The loader and loader+KTX2 paths need up to 25.5 / 45.5 KiB of *measured* offsets: the deleted custom GLB parser, island texture generators (S2-P6), threshold contour helpers (S1-P3), pine mutation machinery (S3-P5), and duplicated cue copy (S3-P1).
   - The public decoder transfer (Basis wrapper and WASM, about 254 KiB source gzip) is accounted for **separately**.
   - Fresh production byte counts are required before any allocation.
2. **Triangles are the binding GPU resource.**
   - S9-P4 fixes the long-session spike (566–575k today) before any reserve is spent.
   - Offsets are measured, not assumed.
   - 480k is rebaselined only on S9-P5a M5 evidence, never above 500k.
3. **The M5 Pro is the acceptance device.** RTX headroom is not M5 headroom, and Metal per-pass timers are not additive. S9-P5a runs before any reserve is spent; S9-P5b certifies the release.

---

## 8. Acceptance and evidence

**Taste gate** (operator: CP-Destination and CP-Final; S9 rubric).

- **Presentation order:** randomized X/Y full frames, then 16 px blur/notan, then crops.
- **Scores (1–5 each):** garden recognition, relaxation (ten-minute silent watch in normal motion plus the static alternative), and market reading.
- **To ship:** the operator prefers the candidate; garden ≥4 and relaxation ≥4; market ≥3 after teaching; zero confident false analytical claims.
- **Value-plan MAE** is diagnostic only.
- **Sound** may never compensate for a restless composition.

**Reading gate** (S3 blinded five-second protocol, extended per C3 #4).

- **Panel:** 12 unfamiliar participants; day/night × both gates × normal/reduced; grayscale arms included.
- **Pass:** ≥10/12 get the primary meanings and the health qualification right, and ≥80 % of risk-band matches are correct.
- **Unprompted probe:** ask what gravel, moss, stones, leader prominence and basin sound mean. After teaching, participants must be able to tell apart:
  - dated official PSI history (the gravel) from categorical water risk and lifecycle (cemetery) stones;
  - decorative moss, threshold stones and basin sound, which carry **no** meaning about safety, magnitude or issuance;
  - leader prominence, which is qualitative rank, never proportional cap.
- **Scenes:** held, missing and version-gap history; saturated-scale leaders; Ledger/Wreck waters.
- **Blocking rule:** any recurring confident false inference ("held = calm", "size = proportional", "moss = safe") blocks the affected cutover.
- **Static frames** must keep: signatures, the dated trace and its gaps, identity, evidence qualifications, categorical cargo, selected-inspection cues, and hull contact. Mover history may be omitted. No continuous RAF.
- **Recruitment and hardware:** the operator names who recruits the 12 readers and supplies the M5 Pro. Missing access blocks release evidence, not authoring.

**Capture lanes.**

- Every capture runs as `env -u CI npm run preview -- --url http://localhost:5173 --headed …`, serially on one GPU, with a fixed fixture and date. On Linux, `--headed` is required.
- Matrices are defined per spec:
  - S1: D/W/C/N/R/O.
  - S4: five beats + moon + season + six clouds + ROI.
  - S5: fixture × size × phase × motion.
  - S6: **320-cap** matrix. Dense has 132 identities; this proves capacity, not 320 rendered hulls.
  - S7: D/N/O/GW/GC/R.
- Promotion goes through the S9-P3 look-selection lane, which enforces manifest identity.

**Device gate (M5 Pro).**

- S9-P5a: baseline protocol, run first.
- S9-P5b: final certification on the integrated tree. DPR 1 and 2; rest, night, selected, dense and overview; 60 s tails plus a ≥600 s stability run. No retry-based acceptance.

**Correctness gates.**

- Per packet: the targeted `npm test -- <paths>` from its spec.
- At integration: `npm run validate:changed`.
- Before release: `env -u CI npm run validate:release` and `npm run test:perf:reference`.
- After deploy: `npm run smoke:live -- --url https://pharosville.pharos.watch`.

**Release (single release, per R1).**

1. Feature notes accumulate under `CHANGELOG.md` "Unreleased — Garden Observatory". The in-app changelog is updated only by the release PR, which mirrors all three surfaces (`docs/pharosville/RELEASES.md:16-21,34-58`).
2. A separately authorized `release/vX.Y.Z` branch is cut from current `main`.
3. Protected PR gates pass.
4. The exact SHA deploys to `main` successfully and passes live smoke.
5. `.github/workflows/release.yml` alone creates the tag and the Release. Never a manual tag, release or direct deploy.

---

## 9. Invariant charter (S9-P1, adopted under D2)

**Scope.** Only the clauses named below change, and each changes atomically with its owning code, tests and docs. **Every other requirement in CONTRACTS.md and VISUAL_INVARIANTS.md remains binding.** This summary is not exhaustive. D12/D17 change only the limits they name.

**Retire or replace** (owner in brackets):

| Current rule | Replacement or owner |
|---|---|
| Threshold recipe: six pads, three textureless draws, ≤15k triangles | [S1] |
| Exact seat numbers | One approved seated composition across gate profiles [S1/S8] |
| Resource-equal A/B | Signed owner deltas under global caps [S9] |
| Literal one-for-one displacement | Name the displaced salience or cost [S9] |
| Inspection-only water names | At most two rest names plus a learnable static key [S3] |
| "Exactly three readings" | Three immediate readings plus one subordinate dated record [S3] |
| Fixed solar apex | Bounded seasonal apex [S4] |
| K44 forced home | Explicit stroll; Home → seat; Escape → station pose; idle never tours [S8] |
| Procedural-only ownership; generator-only models; textureless GLB | Checked authored sources with provenance; one loader, clean cutover [S2] |
| Near-black night ninth targets | Region floors [S4] |
| "No new textures" | Measured owner deltas [S2/S9] |
| Fixed 3/5/7 moorings | Projected unequal masses [S6] |
| The `feat/hour-print` programme clause | — [S9] |

**Explicitly not retired:** exclusive warning precedence (`CONTRACTS.md:101-105`), because D7 was declined.

**Keep, explicitly** (from C3 #1):

- **API and security:** same-origin `/api/*`; `PHAROS_API_KEY` server-side only.
- **Desktop gate:** the sorted size gate (900×720 / 1200×640, never orientation), with the world unmounted below it.
- **Risk evidence:** own peg/DEWS evidence is distinct from an inherited berth.
- **Official data:** official PSI, its version, observation and accepted appearance; independent freshness, coverage and publication times.
- **Issuance:** measurement versus allocation, materiality and pace.
- **Geography:** the sole weekly supply tide; finite geography and its classification field.
- **Records:** every eligible record is visible and reachable.
- **Fallback:** the renderer-failure DOM overview.
- **Sound:** audio consent; sound is never an analytical carrier.
- **Accessibility:** DOM/ledger parity; non-colour and non-motion carriers; complete zero-RAF reduced motion.
- **Rendering:** one WebGL renderer; local assets; the shared clock; hero-only reflection.
- **Visual identity:** the four palette anchors.
- **Attention:** director limits (six events per hour, the 12-minute quiet).
- **Ops:** global caps except as approved; protected releases.

**Test pins.** Delete exact-recipe pins; rewrite them as semantic, clearance, budget and lifecycle tests. Files and lines are in S9 §Invariant charter and in each spec. Ownership of the threshold pins: S1-P1 retires the recipe and texturelessness pins; S2-P6 only adds atlas ownership and lifecycle coverage.

---

## 10. Risks and do-not-do

**Risks**

| # | Risk | Mitigation |
|---|---|---|
| 1 | **No operator graybox checkpoint (D3).** A composition error is discovered only at CP-Final. | The CP-Destination graybox is a complete whole-frame candidate. The orchestrator runs an internal graybox gate against the approved board, archives the evidence, and escalates instead of guessing. |
| 2 | **One big release (R1).** Long-lived integration branch, late feedback. | Single integration owner; serialized chains; rebase per packet; `validate:changed` at each merge. |
| 3 | **The declined S3-P2 leaves today's raw-error caption** until S3-P7 lands. | S3-P7 runs in Layer 0. The operator can re-admit S3-P2 at any time. |
| 4 | **Gravel, stones or moss become a second hero, or imply meaning they don't carry.** | 16 px blur rule: the tower must win. The reading-gate probes in §8. |
| 5 | **Triangle and JS budgets.** | §7. |
| 6 | **Static water codebook reads as chart hatching.** | S5-P1 blinded match; revert if it fails. |
| 7 | **The stroll exposes unfinished low views.** | S8-P3 runs after S1, S6 and S7. |
| 8 | **Shared-seam churn.** | Single integration owner. The S9-P2 inspector names owners; do not split files by length. |

**Do not:**

- migrate to WebGPU, adopt R3F, build an editor framework, or use splats;
- apply a full-screen NPR or Kuwahara pass;
- add SSR/SSGI, an FFT ocean, or depth of field over analytical objects;
- add more bloom, fog or haze to hide weak forms;
- work from a prop checklist (torii, extra lanterns, bamboo walls, grass carpets);
- raise fauna counts or the event budget;
- map koi count to coin count, or add a health lantern ring;
- hide or aggregate eligible hulls;
- loosen schema validation;
- run coefficient-scale craft packets (A2, B1, P1 and W1 already failed).

---

## 11. Critique dispositions

**C1 — goal fit** (`reviews/C1-goal-critique.md`)

| Point | Disposition |
|---|---|
| Main lever is the whole-frame hierarchy, with fleet and headland as partners | Adopted (§0, lever 1). |
| Producible destination | Adopted: the A board plus a production-renderer graybox candidate at CP-Destination (§5.1). |
| R1 first release slice | **Overruled by the operator** (single release). The useful parts remain as semantic-closure rules (§5.2 rules 4 and 6). |
| Essential experience earlier | Adopted: S8-P4 split (§5.2 rule 6). |
| Asset compiler is not a Layer-0 necessity | Noted in the register (deferrable). |
| Unbundle D6/D16 | Done (§4). |
| Name who recruits readers and supplies the M5 Pro | Added (§8). |

**C2 — feasibility** (`reviews/C2-feasibility-critique.md`)

| Point | Disposition |
|---|---|
| Dependency violations | Fixed: layers recomputed, splits S9-P5a/b, S7-P3a/b, S8-P4a/b, S9-P7a (§5.2, §6). |
| Missing dependency cells | Added (§6). |
| Same-wave file conflicts | Fixed: integration owner plus serialized chains (§5.1). |
| Budget ledger | Corrected (§7). |
| Spec contradictions | Resolved: S1 macro B is not authored (D1 = A); S1-P2 exports the inset, S3-P4 owns the data, S3-P5 owns the trace; pin ownership (§9); Escape semantics (§4 D8). |
| Water-reflection citation wording | Corrected (§2, §5.3). |

**C3 — truth and contracts** (`reviews/C3-truth-critique.md`)

| Point | Disposition |
|---|---|
| Charter allowlist | Adopted (§9). |
| Approval for analytical retirements (proposed D18) | Satisfied by the operator approving D6c; the full S3 table is cited (§4). |
| Static water must not ship before its key | Adopted (§5.2 rule 4). |
| Cross-channel lie tests | Adopted (§8). |
| CSP and admission requirements in the register | Adopted (§6). |
| Do not pre-diagnose mint-burn | Adopted (§5.3). |
| Branch and changelog supersession | Adopted (§5.1, §8, §9). |
| Should-fixes: Escape, 320-cap, root PRODUCT.md | Applied. |

---

## Appendix: report index

**Wave 1 evidence** (`evidence/`):

| File | File |
|---|---|
| `L01-composition.md` | `L11-chrome.md` |
| `L02-render-pipeline.md` | `L12-motion-sound.md` |
| `L03-stylization.md` | `L13-camera-interaction.md` |
| `L04-water.md` | `L14-light-sky.md` |
| `L05-vegetation.md` | `L15-tech-stack.md` |
| `L06-terrain.md` | `L16-asset-pipeline.md` |
| `L07-architecture.md` | `L17-history-process.md` |
| `L08-fleet.md` | `L18-external-sota.md` |
| `L09-data-legibility.md` | `L19-first-impression.md` |
| `L10-data-as-garden.md` | `L20-art-velocity.md` |

**Wave 2 specs** (`specs/`):

- `S1-threshold-garden.md`
- `S2-materials-pipeline.md`
- `S3-data-grammar.md`
- `S4-light-atmosphere.md`
- `S5-water-shore.md`
- `S6-fleet-composition.md`
- `S7-landscape-architecture.md`
- `S8-experience.md`
- `S9-enablers-process.md`

**Wave 3 reviews** (`reviews/`):

- `C1-goal-critique.md`
- `C2-feasibility-critique.md`
- `C3-truth-critique.md`

**Baseline captures:** `outputs/holistic/*.png` and `*.json`, untracked scratch.

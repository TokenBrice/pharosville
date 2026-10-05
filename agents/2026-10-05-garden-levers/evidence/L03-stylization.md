# L03 — Stylization & materials

## Verdict

There is one **technical lighting language**, but not yet one convincing **material/shape language**: the richly articulated lighthouse shares a frame with nearly featureless garden surfaces and chunky botanical silhouettes. Choose **refined stylized PBR with authored painterly surfaces**, not a full-screen print filter: keep physical light, quiet broad colour masses and readable data cloth, while making moss, stone, timber and foliage recognizably different at the seated viewing distance.

## Evidence

1. **Confirm hypotheses 1–2 visually, but refute “everything is flat-shaded.”** `outputs/holistic/day.png` (bottom third/top-left) shows a smooth blank green bank and thick umbrella-like pine pads; `overview.png` shows the finite square diorama. Threshold land/pines are already smooth `MeshStandardMaterial`, roughness 0.98/0.96, vertex-coloured (`src/three/garden-threshold.ts:804-828`). Ship hull/deck/gunwale are flat Standard with baked wood values (`garden-ships.ts:832-864`); harbour stone/roof/walls use flat Standard, timber smooth (`garden-harbor-batch.ts:255-264`). The problem is not Lambert versus Standard: it is uneven authored detail, silhouette sophistication and material differentiation. [INFERENCE] Merely smoothing more normals will not produce a garden.

2. **Atmospheric coherence is real; “print” is mostly lighting, not a complete NPR surface model.** Shade inks recolour indirect diffuse while preserving luminance and leaving direct light distinct (`garden-print-inks.ts:23-46,244-260`). One air is shared through replaced fog chunks (`garden-aerial.ts:295-351`), but object transmittance has three soft steps, water smooth (`:234-255,283-290`). Identity cloth/practicals are intentionally exempt from re-inking (`garden-print-inks.ts:270-291`). Keep these strong seams, rather than introduce competing fog/material clocks.

3. **Refute “only noise, normals and LUT textures.”** The GLB loader reconstructs textureless Standard materials from factors/vertex colours and infers flat shading from missing normals (`garden-models.ts:630-666`; lighthouse manifest `:255-261`: 30,436 triangles, zero textures). Runtime also has sail and chain atlases (`garden-sail-atlas.ts:61-64`, `garden-chain-flag.ts:121-124`), island moss roughness and gravel normals (`garden-island.ts:143-162,934-939,2073-2077`). These existing garden-detail efforts are not legible in the rest capture. The shared noise pack is explicitly data, has no mipmaps and is linearly filtered (`garden-noise-pack.ts:57-64`): do not mistake it for an antialiased authored surface atlas.

4. **Edge treatment does not unite the visible garden.** The existing keyline finds only geometry against cleared-depth sky; it deliberately avoids creases, fades with distance, and costs four depth taps (`garden-post.ts:512-554`). Paper grain is disabled because fixed blue-noise looked digital (`:342-349`). `day.png` shows crisp lighthouse masonry versus rounded undifferentiated ground; `selected-usdc.png` shows blunt hull/roof edges. [INFERENCE] Thick universal outlines would outline the sail carpet rather than solve that mismatch.

5. **Confirm hypothesis 3's appearance, not its sole cause.** Noon is blue/hazy; night loses almost all foreground material separation (`day.png`, `night.png`). The palette's older “Golden Garden” rationale still authors a honey key/cream horizon and permits C<0.16 (`palette.ts:6-21,55-60`), whereas the design bible requires neutral noon and only two world anchors above C0.12 (`VISUAL_INVARIANTS.md:71-77,114-122`). `aurora_green` is documented C0.150; several roofs C0.130–0.140 (`palette.ts:75-89`). This is specification drift, not proof those tokens alone cause the current haze. Day baseline is 179 calls, 374,708 triangles, 50 textures, GPU p50 2.47 ms (`outputs/holistic/day.json:30,55,1699-1700`): GPU headroom exists, but triangles and the 948/963 KiB JS envelope are not unlimited (`02-execution-record.md:31`).

## Direction choice

**Refined stylized PBR wins [INFERENCE].** Ghibli-like authored value masses plus restrained, weathered garden material cues—not film imitation or Ghost-of-Tsushima photorealism—fits the moving/inspectable world and existing Standard/custom-water infrastructure. **Soft toon with hand-painted textures** is a useful surface-authoring technique within that direction, but hard lighting bands risk abrupt readability changes. **Sumi-e/ukiyo-e NPR** could be coherent only through a complete geometry/surface/edge restyle, including the tower; a paper overlay would leave the present mismatch intact and conflict with precise multicolour identity. **Kuwahara** risks erasing mon, rigging and boundaries and temporally swimming under motion; reject it as the primary renderer-wide language. These are design judgments, not measured candidate results.

## Ranked levers

### 1. One authored material grammar · Impact 5/5 · Effort L

**Change:** Define stone/moss/gravel/timber/roof/cloth recipes across threshold, island, rim, flora, harbour buckets, procedural/batched ships and GLB material preparation. Use Standard near surfaces, shared broad colour variation and controlled roughness; retain custom water under the same air/light. Migrate existing builders, including hero rematerialization, rather than add a parallel renderer. Preserve cloth identity and cue exemptions; reuse `chainGardenMaterialPatch` (`garden-aerial.ts:372-386`).

**Why:** Removes the “hero asset pasted into toy scenery” impression system-wide. **Risk:** broad migration can break shader patch ordering/batching. **Contracts:** PRODUCT §Design Principles 4–5; CONTR​ACTS §Analytical authority (`:109-118`); architecture ceilings (`:90-95`), bundle cap. **Dependencies:** asset authoring, foliage, fleet/harbour batching, lighting. **Verification:** matched preview rest/selection/overview images, material/atlas/model tests, runtime-media checks and resource census on Apple M5 Pro; no new cue or lost logo.

### 2. Make the near garden tactile at rest · Impact 5/5 · Effort M

**Change:** Replace the bank's lawn-like uniformity with large authored moss islands, exposed weathered stone and a quiet gravel/earth interval; use one shared mipmapped local surface atlas (colour/data correctly tagged), derivative-filtered detail and a wet-edge roughness gradient. Reauthor near pine branch taper and pad contours with needle-cluster breakup, not more identical spheres. Work in `garden-threshold`, `garden-niwaki`, `garden-flora`; carry the same treatment to the headland.

**Why:** The foreground finally communicates gardening and age instead of empty mesh. **Risk:** detail noise/alpha overdraw, cultural prop accumulation. **Contracts:** explicitly bends the **textureless, three-draw, 15k-triangle threshold** (`VISUAL_INVARIANTS.md:47-57`); preserve broad shade planes, empty inlet and attention budget (`:38-45,97-112`). Keep three draws where feasible; revise geometry ceiling only with evidence. **Dependencies:** composition/geometry authoring and lever 1. **Verification:** preview whole frame, 16px blur and near crop at both gate sizes; temporal drift/DPR2 alias check; threshold/niwaki tests, texture lifecycle/census.

### 3. Reconcile the dye lot with five-beat material readability · Impact 4/5 · Effort M

**Change:** Re-author supporting palette roles against neutral noon, complementary golden light and legible indigo night; reconcile the C0.12/C0.16 contradiction. In palette/print-inks/aerial/day-cycle/post, establish clearly separated stone, moss, wood and water values before grade. Keep pinned anchors, issuer identity and risk ladder; use night fill that reveals mass without decorative emission.

**Why:** Surface craft cannot read through uniform noon blue or crushed night blacks. **Risk:** attractive grade conceals failed composition or alters risk distinctions. **Contracts:** value plan, atmosphere-before-grade, wall-clock ownership and immutable anchors (`VISUAL_INVARIANTS.md:27-36,69-95,114-122`). **Dependencies:** lighting reviewer, DOM chrome palette, data-cue review. **Verification:** five-beat preview/value-plan/greyscale comparisons and night-water metric; palette/chrome-air/print-ink tests; semantic parity unchanged.

### 4. Material-aware edges, not a second outline style · Impact 3/5 · Effort M

**Change:** Authored bevels/weighted normals on near timber and stone; irregular broken edges on natural rocks; simplify distant tower microstructure by distance while retaining its recognizable tiers. Tune existing sky keyline only after this, without Sobel or full-scene toon contours.

**Risk:** geometry cost or softer silhouette weakens the hero. **Contracts:** one hero and near/far weight (`VISUAL_INVARIANTS.md:38-45`), 500k triangle ceiling. **Dependencies:** model generators, near-ship LOD, AO/shadow calibration. **Verification:** preview near-hull/tower crops plus whole-frame acceptance; model metadata/anchor tests and draw census.

## Do-not-do / traps

Do not spend the available GPU budget on noise everywhere, extra bloom, reflective moss, full-screen paper, universal ink or Kuwahara. Do not add maples/bamboo merely as cultural badges (PRODUCT:41-42). A2/B1/P1 were indistinguishable at whole-frame scale; W1 was unwarranted (`02-execution-record.md:17-20`): demand a changed material read at rest, not tiny roughness/amplitude deltas or close-up-only wins.

## Invariants worth challenging

Challenge only the threshold's **textureless** mandate and fixed construction-triangle allocation, not its shaded framing/low draw count. Six immutable limb-pad anchors (`VISUAL_INVARIANTS.md:47-51`) should permit re-authored botanical contours, not freeze the current umbrellas. Reconcile chroma specifications; preserve the four pinned anchors. Do not challenge security, viewport gate, DOM parity, complete static reduced motion or single WebGL renderer.

## Captures wanted

Run serially on reference hardware; commands are requests, not exercised checks. The date/fixture pins keep before/after comparisons controlled. Repeat the first invocation with `t=7`, `18.5`, `19.2`, `22`, matching output names; repeat the compact arm at `--width 900 --height 720`.

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --width 1600 --height 1000 --seconds 20 --clean --blur-audit --texture-census --draw-census --assert --out l03/day.png --json l03/day.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#sel=ship.usdc-circle&t=12.25' --width 1600 --height 1000 --seconds 20 --assert --out l03/selected.png --json l03/selected.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#cam=0,0,0.28&t=12.25' --width 1600 --height 1000 --seconds 20 --texture-census --assert --out l03/overview.png --json l03/overview.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=22' --width 1200 --height 640 --reduced --night-water --assert --out l03/night-static.png --json l03/night-static.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --width 1600 --height 1000 --dpr 2 --still-camera --burst 9 --interval 600 --clip 0,650,1600,300 --burst-sheet --temporal --out l03/surface-drift.png --json l03/surface-drift.json
```

Review performed from supplied GPU captures and source only; no tests, builds or browser sessions run.

# C1 — Goal fit, art direction and prioritization

## Verdict

The diagnosis is substantially right, but the plan is still a subsystem improvement programme rather than a tightly directed first transformation. Foreground authorship is necessary, not sufficient: the category change depends on jointly composing the garden, fleet, water and viewing hierarchy, then delivering that same experience on arrival and inspection. Approve a visual experiment and a bounded release, not all nine lanes at once.

## Must-fix

1. **§0 ranked levers / §5.1 CP-B — Make whole-frame composition the main lever, not just the foreground.**

   `day.png` still reads first as monument-and-boats; `overview.png` reveals a tray, while `selected-usdc.png` abandons the garden for sky and vessels. L01 explicitly couples seat-to-water and projected masses (`evidence/L01-composition.md:5,25-35`), but the plan demotes fleet to seventh and schedules its projected sketch at CP-B before its implementation in W2 (`00-implementation-plan.md:33,193,205`). Current camera targets optimise tower anchors, not garden presence (`src/systems/rest-seat.ts:38-43`; `src/systems/camera.ts:409-411`). S1's initial camera retention is sensible, but not evidence that the pose is optimal (`specs/S1-threshold-garden.md:7,48,84`).

   **Replace the opening and first lever row:**

   > The main lever is one approved whole-frame hierarchy: a clearly inhabited Japanese viewing garden, a continuous quiet inlet, a dominant Pharos, and subordinate unequal fleet masses. S1 is its largest local intervention; S6-P1/P2 and the headland silhouette are composition partners, not later decoration. Preserve the existing seat initially; reopen pose/FOV only if neither complete candidate reaches the garden/reading rubric at both gates. Any change reaccepts threshold, fleet and camera together.

   **Replace CP-B:**

   > Review two complete macro candidates with near-garden masses, projected flotillas, headland silhouette and chrome footprint together. Show both gate profiles, day/night, rest/selection and overview. Freeze the seat only after this review; do not approve a beautiful foreground over the old sail barcode.

2. **§4 D1/D11 / Wave 0 — Specify a producible destination, not a verbal choice between two foreground treatments.**

   A/B currently share all five references and differ chiefly in substrate (`specs/S9-enablers-process.md:14-26`). S9-P1 is docs-only and names no paintover author, artifact contract or production method (`:60-62`). Yet CP-A requires paintovers and D11's material/style decision is separate from the destination (`00-implementation-plan.md:157,167,192`). This repeats the history's missing stable visual destination rather than repairing it (`evidence/L17-history-process.md:9,25-35`).

   **Replace D1 and append to S9-P1:**

   > D1 chooses a whole-scene destination, not moss versus gravel in isolation. The S9 art-direction owner assembles two annotated boards from the cited primary references; S1 authors matched coarse geometry candidates, with S6 placement descriptors and S7 silhouette input, in the existing production renderer. Produce day/night full frames at 1600×1000 and both gates, overview, one selected-ship frame, and 16px notan. Label geometric evidence versus aspirational material overlays. Annotate desired near/mid/far scale, salience, quiet-water intervals, tower/garden balance, surface language and forbidden outcomes. Use local raster/SVG compositing for annotations; no generated picture is evidence of achievable geometry. Retain baseline and candidate manifests. Operator picks, rejects or requests revision before finished asset work.

   > Decide D11 with D1. Recommend refined stylized PBR provisionally, demonstrated on the same tower/pine/stone/sail crop and full frame; do not treat “PBR versus NPR” as proof of coherent style. Keep A as the default experiment, not a preselected winner.

   Advance the S1-P1 candidate experiment into destination selection; CP-A approves direction and CP-B confirms the production graybox. References inspire scale, joins and hierarchy, not a prop checklist.

3. **§5 waves / §8 release cuts — Replace “after W2” with a capability-defined first visible release.**

   W2 is not a finished garden: shelter waits until W4, the key until W3, seen teaching until W4, and camera/arrival until W5/W8 (`00-implementation-plan.md:264,271,275,282,290`). S1-P4 also depends on irradiance and the architecture kit (`specs/S1-threshold-garden.md:75-79`); night release requires measured emission evidence, not just brighter pixels (`specs/S4-light-atmosphere.md:28-30`). The suggested W2 release (`00-implementation-plan.md:346`) therefore does not define a coherent step change.

   **Replace that sentence with:**

   > R1 “Garden seat and readable market” is a separately specified, production-complete release, not a wave number or a partial parent packet. Rewrite the following packet boundaries and dependencies before execution; retain the later programme as R2/R3.

   | R1 work unit | Finished capability / explicit boundary |
   |---|---|
   | Destination | Item 2's approved whole-frame candidates and semantic charter. |
   | Viewing garden | Selected moss/stone/path composition, porous pine and visible cropped shelter; shared texture-free S2-P1 roles. Author only the required engawa fragment, not the full S7 kit. |
   | Fleet hierarchy | S6-P1/P2/P4: projected unequal masses, footprint LOD, readable legal leaders and matching settled/static headings; no vessel remodel or cloth overhaul. |
   | Readable night | S4-P1 integrated against finished surfaces; include S5's emission/occupancy proof. Use the existing coherent fill rig; defer daylight transport and zonal irradiance, with no claim they shipped. |
   | Taught truth | S3-P1/P2/P6 plus the three-reading key and S5-P1 static signatures. Key examples match current rendered states; defer six-cloud recognition and the new gravel record. |
   | Arrival/inspection | Immediate ready rest, immediate DOM facts and panel-safe contextual selection, as item 4 specifies. |
   | Acceptance | Spike fix, signed owner deltas, actual M5 evidence, operator garden/relaxation rubric and blinded reading protocol; both gates, day/night, dense/held and reduced-motion arms. |

   > Defer compiler/loader/atlas expansion, geological/coastal overhaul, architecture kit, seasonal apex, history trace, stroll, new life/audio and social art. R1 is a visible garden-and-reading improvement, not the completed state-of-the-art destination. No placeholder geometry ships; any failed capability blocks this release.

4. **§5.2 “Experience polish last” — Separate essential entry/inspection from optional stroll and sound.**

   The existing arrival deliberately takes nine seconds and adds haze (`src/systems/garden-arrival.ts:11-16`); detail disclosure waits for camera progress (`src/pharosville-world.tsx:484-487`). S8-P4's immediate facts and panel-aware framing are consequently not cosmetic, yet its P3 stroll dependency delays them to W8 (`specs/S8-experience.md:47-53`).

   **Replace the rationale:**

   > Essential experience ships with R1: S8-P1's task-ready arrival and S8-P4's immediate facts/panel-aware candidate scoring. Split S8-P4's station-local restoration and remote stroll paths into the later S8-P3 integration; R1 retains existing supported selection paths and their safety tests. Optional stroll, resident-motion redesign and basin sound follow accepted world geometry. Evaluate relaxation with a ten-minute silent normal-motion watch and the complete static alternative; sound must never compensate for restless composition.

## Should-fix

- Put the destination enabler before ranked implementation levers. Resolve D1/D11 before commissioning the large asset compiler; procedural-first R1 does not justify that Wave-0 L packet.
- Unbundle D6 and D16: history admission, names, re-teaching, loading shell and audio synthesis are independent choices. Decide technical defaults by evidence, not a seventeen-question taste ballot.
- Record who recruits the twelve unfamiliar readers and supplies M5 hardware. Missing access blocks release evidence, not bounded candidate authoring.

## Keep unchanged

Keep the renderer, operator-only taste judgment, semantic test retirement, full eligible fleet, exact DOM truth, scoped source qualification, unchanged attention limits and complete reduced-motion scene. The WebGPU/NPR/extra-pass prohibitions are sound for this programme; external benchmarks support authored specificity, not a mandatory engine migration (`evidence/L18-external-sota.md:9,13-19`).

Review evidence: plan/spec/source inspection and the four requested baseline images only; no tests, builds, gates or browser runs.

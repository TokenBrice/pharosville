# L17 — History & process audit

## Verdict

The project has repeatedly changed art direction, but its latest improvement process froze almost every high-impact variable and asked tiny, resource-neutral edits to win whole-frame reviews. The strongest lever is not weaker QA: it is an operator-approved visual destination, followed by macro-scale alternatives whose implementation constraints are rewritten together rather than inherited as sacred composition.

## Evidence

1. **Large changes were tried; this is not simply a history of timid tuning.** The last 300 commit subjects include `6faf440` (grand redesign), `f55afbc` (sailed-in warm village), `a989bfe` (Golden Garden), `5a187df` (perspective Reborn), and `3023552`/`bf15f8f` (Hour-Print seat/light). Release notes show successive garden/atmosphere/fleet rewrites: `CHANGELOG.md:218-245,79-110,45-59`. The direction also reverses: close camera and persistent station chips in v0.14, widened camera and quiet chips immediately afterward (`CHANGELOG.md:127-150`); honey-key Golden Garden becomes neutral noon (`CHANGELOG.md:123`; `docs/pharosville/CONTRACTS.md:349-352`). [INFERENCE] The missing ingredient is a stable, visually approved destination, not another descriptive release name.

2. **Latest art packets were constrained to micro-change before judging.** A1 froze camera/fleet/water/clocks, preserved pad anchors and sizes, initially changed bank colours only, and prohibited any triangle delta (`agents/2026-10-02-visual-upgrade/01-implementation-plan.md:354-385`). B1's first experiment was patina .075→.050; A2 adjusted wet-edge coefficients while freezing geometry and finish structure (`same file:413,614-616`). These are appropriate craft experiments, not credible tests of a different garden identity.

3. **Rejection evidence argues for changing the experiment scale, not weakening its gate.** A1 won on its third iteration; A2 lost twice as indistinguishable, B1's hull crops were indistinguishable, P1 produced no whole-frame gain, and W1 was not warranted by measured temporal change (`agents/2026-10-02-visual-upgrade/02-execution-record.md:15-20`). The blind full-frame-first gate is sound (`01-implementation-plan.md:644-648`). Requiring unchanged calls/triangles/geometries/textures simultaneously (`:645`) sharply narrows the candidate space. Distinguishability alone is necessary, not proof of garden quality.

4. **MAE is diagnostic, not formally the beauty gate—but it incentivizes optimizing the wrong scale.** The plan explicitly says numbers never approve (`01-implementation-plan.md:82,135,618`). Nevertheless acceptance records headline day MAE 8.98→8.30 and night MAE 3.1; threshold night values remained 1.3/0.9/1.1 against 3/7/4 targets (`02-execution-record.md:15-16,37-39`). Nine regional means cannot distinguish credible moss/stone/branches from a smooth green mass. Current `outputs/holistic/day.png` confirms H2: broad lumpy bank and schematic upper-left pine remain. `night.png` confirms severe foreground/data darkness (H3), although the sky and beacon are not black. `overview.png` confirms H1's floating plate reading; day contains many tiny background sails (H4), but their semantic comprehension needs a reader study, not this history audit.

5. **The operator approval seam did not remain human.** §4 names the operator alone as blind art and final reading reviewer (`01-implementation-plan.md:103`), whereas the execution record explicitly says all art/reading decisions were delegated to the orchestrator (`02-execution-record.md:3-6`). This was authorized, not noncompliance. [INFERENCE] It nevertheless removes the most direct signal of the operator's taste. More model audits of factual correctness cannot replace that signal.

6. **Implementation locks exist, but the named guard script is not the main art blocker.** `scripts/check-guards.test.mjs:351-389` pins workflow/script text; `:756-767` rejects a WebGPU bundle. These defend deployment/security/renderer contracts, not pine aesthetics. Actual visual locks include exactly three threshold meshes/materials and no Texture-valued material property (`src/three/garden-threshold.test.ts:197-222`), fixed screen region (`:184-194`), and exactly 42 island draws (`src/three/garden-island.test.ts:199-204`). The bible canonizes six inward-only pads, textureless threshold, and its existing silhouette (`docs/pharosville/VISUAL_INVARIANTS.md:47-57`). Behavioural tests can still pin one implementation.

7. **Attention restraint is mostly a strength; resource equality is the sharper brake.** The event budget excludes continuous wind/water and does not prohibit static material detail (`VISUAL_INVARIANTS.md:99-112`). Literal “a prop removes a prop” can, however, confuse object count with visual salience. The checklist says no new textures because overview is 72/72 (`docs/pharosville/CHANGE_CHECKLIST.md:28-30`); rest currently measures 179 calls, 179 geometries and GPU p95 3.17 ms (`outputs/holistic/day.json:30,51-56`). That is RTX evidence, not permission to assume M5 headroom. JS was 948/963 KiB and a pre-existing long-session triangle spike survived a retry (`02-execution-record.md:31,83-87`).

## Ranked levers

### 1. Approve a destination before more packets
- **Change:** Produce three annotated reference/target boards and composition paintovers of the same live rest frame: spatial principles, believable garden materials, data hierarchy, day/night pairs, and explicit anti-targets. Operator chooses one; update `PRODUCT.md`/`VISUAL_INVARIANTS.md` before implementation specifications. References guide structure, not copied cultural props.
- **Impact 5/5:** Establishes what “better” actually looks like, beyond poetic labels. **Effort S. Risk:** ambiguous boards or approving only a flattering hour.
- **Touches:** `PRODUCT.md:22-24,28-42`; bible “The picture,” fixed seat, value plan. **Dependencies:** composition, vegetation, terrain, lighting and data-legibility reviewers.
- **Verification:** Blind full-frame preference against baseline plus explanation of market condition; paired actual preview frames must approach the chosen board. No software test can validate taste.

### 2. Replace micro packets with two macro alternatives
- **Change:** Author two complete, deliberately different garden-threshold/composition treatments against the same frozen payload. Permit changed branch architecture, bank silhouette/materials and seat framing; own `rest-seat.ts`, threshold/flora/island and corresponding docs/tests as one coherent art experiment. Maintain the empty inlet and analytical truth. Review before polishing details.
- **Impact 5/5:** Tests an actual category-level step change instead of coefficient visibility. **Effort M. Risk:** geometry/picking/arrival regressions and incoherent subsystem styles.
- **Touches:** bible `:19-25,47-57`; A/B resource equality in plan §7.2. Preserve global ceilings initially, replace exact owner-count locks with measured owner ceilings and semantic coverage/disposal tests. **Dependencies:** camera, materials, vegetation, terrain; one integration owner.
- **Verification:** Real-GPU day/night/full-frame/blur comparisons; gate-size and overview captures; targeted threshold, camera, picking and reduced-motion tests; M5 pacing/census before adoption.

### 3. Restore operator checkpoints and an outcome rubric
- **Change:** Require operator decisions at board selection, macro graybox, and final integrated picture—not every coefficient. Record “prefer/reject/undecided” and reasons before explaining changes. Separate shipping correctness from visual acceptance; score garden recognition, relaxing hierarchy, and market-condition reading. Keep MAE as a deviation report, not a score to minimize.
- **Impact 5/5:** Closes the dissatisfaction feedback loop. **Effort S. Risk:** leading questions or substituting model preference again.
- **Touches:** plan §4/§7.2; bible value plan `:27-36`. **Dependencies:** operator availability and data-reading reviewer.
- **Verification:** Retain blinded answers from clean frames, then chrome-on and reduced-motion frames. Final truth tests remain mandatory; passing them does not certify aesthetic acceptance.

### 4. Budget by cost and salience, not historical equality
- **Change:** Replace blanket zero-delta packet rules with explicit owner deltas within global caps; allow texture reuse/atlasing and material detail. Reconcile overlapping Reborn/Hour-Print allowances, and distinguish semantic invariants from provisional craft constraints in docs/tests. Escalate any proposed global cap/bundle increase only with measured M5 evidence; investigate the known triangle spike before treating headroom as spendable.
- **Impact 4/5:** Enables richness while retaining calm and performance. **Effort M. Risk:** threshold creep and mistaking RTX throughput for reference-device capacity.
- **Touches:** `CHANGE_CHECKLIST.md:28-30`; `CONTRACTS.md:383-395`; bible displacement `:99-103`. Retain director event limits. **Dependencies:** rendering/performance/asset owners.
- **Verification:** Animated/static/overview censuses, GPU p95 and long-session resource stability; targeted owner disposal and semantic-parity tests. Guard workflow/security assertions stay.

## Do-not-do / traps

Do not repeat A2/B1/P1 micro-tuning after indistinguishability rejection, optimize ninth means into flatter surfaces, buy life by event counts, or turn approved mood imagery into literal prop accumulation. Do not raise caps to conceal the long-session spike, confuse green tests with a pleasing picture, or soften the blind whole-frame gate. Keep same-origin assets/API, server-only secrets, desktop no-mount boundary and complete DOM/static truth.

## Invariants worth challenging

Challenge exact seat coordinates, six fixed inward-only pads, three textureless threshold draws, unchanged resources per art packet, and literal one-prop-for-one-prop displacement. Keep their purposes—composition, bounded cost, quiet attention—but permit alternate implementations. Challenge numerical ninth targets only after approving a new value sketch; preserve beacon dominance, empty inlet, clock-owned illumination, issuer identity and no colour-only analytical meaning. The product's anti-spectacle rule (`PRODUCT.md:37-42`) is not an anti-craft rule.

## Captures wanted

Run serially on baseline and each candidate served at the URL below; retain unique candidate-specific filenames/manifests. These requests are not executed in this audit.

```sh
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-09-26 --width 1600 --height 1000 --still-camera --reduced --clean --hash '#t=12.25' --metrics --value-plan noon --blur-audit --assert --out levers/L17-day.png --json levers/L17-day.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-09-26 --width 1600 --height 1000 --still-camera --reduced --clean --hash '#t=22' --metrics --value-plan night --blur-audit --assert --out levers/L17-night.png --json levers/L17-night.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1200 --height 640 --hash '#t=12.25' --still-camera --assert --out levers/L17-gate.png --json levers/L17-gate.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1600 --height 1000 --hash '#t=12.25&cam=0,0,0.28' --still-camera --assert --draw-census --texture-census --tail-seconds 60 --out levers/L17-overview.png --json levers/L17-overview.json
```

Audit verification: read-only source/history/capture inspection; no tests, builds, browser or GPU commands run.

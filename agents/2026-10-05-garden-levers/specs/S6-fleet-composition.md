# S6 — Fleet composition

## Lever statement
Replace the sail inventory with three unequal, shore-following flotilla masses, smaller satellites, and readable leading vessels. Every eligible hull stays present; spaciousness comes from shared projected composition and footprint-appropriate craft, not deletion or fog. Beautiful working vessels and genuinely resting cloth make the harbour subordinate to the garden rather than a competing toy display.

## Verified current state
- Placement already clusters: counts are **1/3/5/7**, not invariably 3/5/7 (`src/systems/garden-fleet-placement.ts:177-182`). Centres maximize world-space neighbour distance × density (`:488-525`); berth candidates prioritize radius, then region spacing (`:673-727`). Retained berths reserve water first (`:565-579,646-650`). Inlet and apron legality exist (`:415-418`); do not replace them.
- Display berths feed shared slice offsets and motion planning (`src/systems/garden-observatory-slice.ts:647-692`; `src/systems/motion-planning.ts:606-619`). Own risk remains separate from inherited consort berth (`src/systems/pharosville-world/stages/ship-placement.ts:209-238,467-474,529-536`). Never reclassify a coin to improve composition.
- Batch LOD uses 150 world units and nearest 16, with rank/distance hysteresis and a 0.9-second complementary dissolve (`src/three/garden-fleet-batch.ts:318-346,1730-1809`). Far family silhouettes already exist (`src/three/garden-ships.ts:2248-2279`); this is not an impostor-from-zero project.
- Six East-Asian families already carry nine classes (`src/systems/garden-observatory-slice.ts:85-133`); rigs, sheer, curved cloth and un-furlable identity sail already exist (`src/three/garden-ships.ts:239-309,675-686,2776-2813,2857-2913`). Replace weak macro-shapes, not cultural vocabulary.
- **Scale discrepancy:** executable law is `clamp(0.42*(cap/1e6)^0.10,0.42,1.15)` (`src/systems/ship-visuals.ts:161-179`), confirmed by `$100M→0.6656`, `$10B→1.055`, `$200B→1.15` tests (`src/systems/ship-visuals.test.ts:55-71`). `docs/pharosville/CONTRACTS.md:289` incorrectly says `1e7`. Algebraically, saturation starts around $23.7B; large leaders can tie. S9:hygiene corrects documentation without silently resizing the fleet.
- Wave-1 qualification: both requested gate sizes use the **landscape** eye; the second authored eye is used by 720×900 (`src/systems/rest-seat.ts:26-46`). `--overlap` measures hit rectangles, **not sail occlusion** (`docs/pharosville/TESTING.md:144-150`). Dense contains 132 metadata identities, not 320 (`src/__fixtures__/pharosville-world.ts:279-305,419-421`); `--ship-limit 320` changes admission capacity, not the dataset.

## Target state
At rest, daylight reveals one leading near-left group, a quieter rear-left crescent, and a receding right group, punctuated by sparse satellites. Two obvious water intervals separate those masses; the existing continuous tower inlet remains untouched. Three supply leaders are readable when their legal waters permit near berths, never transferred between bands. Night retains these hull/sail masses through S4 lighting, not a necklace of bright stern lamps. At 1200×640 and 900×720 the hierarchy survives cropping; also inspect 720×900 for the second eye. Reduced motion settles immediately into the same fully composed, slack-cloth, individually pickable fleet; no warm-up or motion-dependent separation.

## Packets
Budget numbers below are **planning ceilings [INFERENCE]**, not measured savings. All packets retain one renderer, local assets, same-origin APIs/server-only credentials, the sorted desktop gate, DOM/ledger truth, non-colour alternatives, zero-animation reduced motion, and release-workflow-only publication. Measure owner deltas; retain `CONTRACTS.md:385-395` ceilings and aggregate JS gzip budget. Each packet records its change in the existing release changelog through S9:hygiene.

### S6-P1 · Shared projected anchorage grammar
**Goal:** Three frame-level masses instead of independent per-band dots.

**Files (6):** `src/systems/garden-fleet-footprint.ts` (new), `src/systems/garden-fleet-placement.ts`, `src/systems/garden-fleet-placement.test.ts`, `src/systems/garden-observatory-slice.ts`, `docs/pharosville/CONTRACTS.md`, `docs/pharosville/VISUAL_INVARIANTS.md`.

**Change:** Add a renderer-independent family envelope descriptor and allocation-conscious projection helper using `worldToScreen`/`worldViewDepth`. Return separate hull/identity-sail polygons, clipped area and CSS-pixel sail height; account for scale, hullForm, heading/brace and bounded cloth motion. Keep conservative envelopes distinct from actual rendered-pixel proof. Author three unequal shoreline spline lobes plus satellites; clip each lobe's berth pool to the actual risk field. A visual mass may contain adjacent legal bands; it is not a new risk category. Reserve retained berths, berth supply-ranked leaders at legal front edges, then fill stable-ID pools. Rank legal candidates lexicographically: hull safety/inlet first, then worst-eye projected overlap and protected clear intervals, then lobe affinity. Cache projections per cold placement; never run the solver in RAF or re-layout on resize. Preserve exhaustive legal-water fallback and every hull; report when capacity relaxes picture goals instead of concealing it. Publish accepted resting-axis metadata alongside mooring membership for P4.

**Amend:** Contracts §Fleet capacity (`264-272`); VI §Hierarchy and emptiness (`38-45`). Delete the odd-count assertion at placement test `109`; rewrite “moors a crowded band…”/“spreads anchorages…” as projected mass/interval tests. Retain legality, determinism, 320 inlet, spacing and four-percent churn tests.

**Budget:** +0 calls/tris/textures; ≤+3 KiB gzip for bounded projection/scoring, no package.

**Acceptance:** Matrix A; synthetic 320 placement tests across all bands and narrow-band overflow. On dense/mixed fixtures, two protected intervals each ≥3% viewport width in both eyes; each leading sail loses <10% projected area to other vessel envelopes. Worst-eye envelope overlap falls ≥25% against the frozen baseline. All eligible IDs survive; churn retains <0.5-tile displacement. `npm test -- src/systems/garden-fleet-placement.test.ts src/systems/garden-fleet-thinning.test.ts src/systems/ship-visuals.test.ts`.

**Effort:** L. **Depends:** S1-P1, S9:destination, S9:invariant-rewrite. **Risk/rollback:** Narrow waters defeat preferred lobes; restore the previous allocator as a complete revision, never a permanent second placement mode.

### S6-P2 · Pixel-footprint LOD and foreground cast
**Goal:** A few readable leaders; distant inventory recedes without disappearing.

**Files (6):** `src/three/garden-fleet-batch.ts`, `src/three/garden-fleet-batch.test.ts`, `src/three/garden-ships.ts`, `src/three/renderer-ship-frame.ts`, `src/renderer/garden-observatory-hit-testing.ts`, `src/renderer/garden-observatory-hit-testing.test.ts`.

**Change:** Consume P1's footprint at the shared displayed pose. Replace distance/nearest-rank rules: initial full-family admission at identity-sail height ≥28 CSS px, departure below 22 px; selection/focus always restores detail. Compose at most three unattended foreground leaders by current supply, not the heritage registry; keep macro-family form for everyone. Fine rig/secondary mast signals require inspection or ≥48 px footprint. Ease ordinary changes over the existing 0.9-second dissolve; static frames cut immediately. Apply the same policy to bespoke GLB heroes: dormant scene graph retained, far representation routed through existing family batches, no extra renderer. Update rig/lantern hero weight instead of leaving GLB heroes permanently at 1. Preserve complete cloth marks; recede chroma, not identity/value. Pick bounds use the shared envelope plus existing minimum tolerance, never the LOD mesh list; DOM/search/keyboard retain all records.

**Amend via S9:invariant-rewrite:** Contracts `278-300`. Delete 150-unit/nearest-16 pins in batch tests `306-333,389-449`; rewrite as pixel hysteresis, viewport/FOV/heading, selected restoration, GLB parity and reduced-motion tests. Keep dissolve coverage and bounded far geometry tests.

**Budget:** +0 calls/textures; ≤0 net triangles at settled rest, transient envelope ≤baseline; ≤+2 KiB gzip. No credit for expected LOD savings until measured.

**Acceptance:** Matrix A+B; no popping on `--pan-zoom`, far hulls remain selectable and keyboard-reachable. Rest cast ≤3 unattended ships; selecting a distant microcap restores its mark/rig without moving berth. `npm test -- src/three/garden-fleet-batch.test.ts src/three/garden-ships.test.ts src/renderer/garden-observatory-hit-testing.test.ts`.

**Effort:** L. **Depends:** S6-P1, S3-P1. **Risk/rollback:** Over-generous hit rectangles swallow gaps; tighten physical envelopes but retain minimum pick tolerance. Revert policy coherently across GLB, batch and picking, not just shaders.

### S6-P3 · Three authored vessel exemplars
**Goal:** Tactile macro-craft visible from the seat, not extra thread detail.

**Files (4):** `src/three/garden-ships.ts`, `src/three/garden-ships.test.ts`, `src/systems/garden-fleet-footprint.ts`, `docs/pharosville/CONTRACTS.md`.

**Change:** Re-author procedural bezaisen carrier (lifted stem/stern, open recessed deck, thin catching gunwale), kobaya working boat (long fine bow, low occupied deck, opposed rig), and junk (compact belly, raised stern, asymmetric batten fan). Approve these at actual 28/48/96-pixel sail sizes before propagating hull/deck/rail logic into all six existing batch families. Preserve class mapping, twin-hull water slot, takasebune cargo banks and scow squatness. Remove duplicated keel/deck bulk rather than adding ornamental fittings. Share family anchors/bounds between exemplars and far geometry. Use S2's timber surface hook after existing shader patches; identity atlas remains untouched. No new GLBs or loader dependency.

**Amend:** Contracts `285-290,399-401`; rewrite geometry-number pins in “S1 curved sheer hull”/“W5.3 batched silhouette form” around family silhouette, waterline, anchors and bounded resource envelopes; retain paint, peg-trim and sail-grid assertions.

**Budget:** +0 calls/textures; ≤+8k total rendered triangles at 320 capacity, replacing old geometry; ≤+1 KiB gzip. Texture leases, if elected, are charged to S2—not counted twice.

**Acceptance:** Matrix A+B and S9:lookdev family sheets. Operator can distinguish three families without logos at 48 px; rest thumbnail changes, not only selection crops. `npm test -- src/three/garden-ships.test.ts src/three/garden-fleet-batch.test.ts src/systems/garden-water-exclusion.test.ts`.

**Effort:** L. **Depends:** S6-P2, S2-P1, S2-P7, S9:destination. **Risk/rollback:** Geometry outgrows berth/pick bounds; stay inside existing maximum margins or reaccept all safety consumers before shipment. Roll back family descriptor and meshes together.

### S6-P4 · Quiet resting headings
**Goal:** Coherent moorings and an authored static pose.

**Files (6):** `src/systems/motion-types.ts`, `src/systems/motion-planning.ts`, `src/systems/motion-sampling/mooring.ts`, `src/systems/motion-sampling/reduced-motion.ts`, `src/systems/motion.test.ts`, `docs/pharosville/CONTRACTS.md`.

**Change:** Carry P1 accepted resting heading into route metadata; include it in route identity/invalidation. Actual quay dwell retains dock tangent (`mooring.ts:66-99`); canonical home/static berths use the authored lobe axis, with bounded deterministic variation. Reduced motion gets that same settled heading rather than zero (`reduced-motion.ts:32-33,66-69`). Blend departure preparation onto outgoing path; underway heading stays authoritative. Preserve settled-wind/risk-ordered anchor sheer (`anchor-ride.ts:15-33,55-61`), water swell and the single clock. S5-P5 owns contact/wake appearance; do not alter analytical intensity here.

**Amend:** Contracts §Media and motion; rewrite zero-heading static pins, retain route continuity, exclusion, sway bounds and risk ordering.

**Budget:** +0 calls/tris/textures; ≤+1 KiB gzip for route metadata.

**Acceptance:** Matrix A reduced + B burst: no initial yaw jump, no arrival/departure snap, dock axes coherent, all water exclusions preserved. `npm test -- src/systems/motion.test.ts src/systems/motion-sampling.test.ts src/systems/reduced-motion.test.ts`.

**Effort:** M. **Depends:** S6-P1. **Risk/rollback:** Authored headings counterfeit navigation; never override underway/wind-owned risk dwell. Revert metadata and samplers together.

### S6-P5 · Slack cloth without furling identity
**Goal:** Moored cloth hangs; it does not remain a wind-filled banner.

**Files (6):** `src/three/garden-fleet-batch.ts`, `src/three/garden-fleet-batch.test.ts`, `src/three/garden-ships.ts`, `src/three/garden-ships.test.ts`, `src/three/renderer-ship-frame.ts`, `docs/pharosville/CONTRACTS.md`.

**Change:** Existing rest luff 0.3 is not sufficient: belly/ripple remain wind-clock-driven (`garden-fleet-batch.ts:433-434,892-901`). Add a packed resting bit to the existing sail-attention carrier, not a seventeenth vertex attribute; migrate pack/unpack, GLSL and CPU reference together. Resting cloth reduces dynamic fill/flutter and adds bounded downward catenary; underway uses existing apparent wind. Shared hero sail patch consumes the same state. Identity bit zero stays unfurled; outside arrival dips sailScale stays 1. Reduced motion evaluates one complete sag pose with no animation.

**Amend:** Contracts `447-456` clarifies fully set ≠ taut; retain F-A brace conventions, CPU/shader parity, furl masks and dip bounds.

**Budget:** +0 calls/tris/textures; ≤+1 KiB gzip; bounded shader arithmetic only.

**Acceptance:** Matrix B golden burst versus reduced still: readable slack edges, no chatter, intact marks and normal sail dips. `npm test -- src/three/garden-fleet-batch.test.ts src/three/garden-ships.test.ts`.

**Effort:** M. **Depends:** S6-P4, S6-P3. **Risk/rollback:** Logo distortion/shading break; revert resting deformation/packing as one change, not furl all sails.

## Capture matrix (acceptance commands; not run)
**A:** Run serially before/after each packet; replace `P` with its ID. Execute the exact command below for the Cartesian product `F=dense,mixed-capacity`, `W,H=1600,1000;1200,640;900,720;720,900`, `T=12.25,22`, `(R,M)=('',motion)` or `(--reduced,reduced)`:

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture "$F" --ship-limit 320 --width "$W" --height "$H" --hash "#t=$T" $R --still-camera --overlap --blur-audit --draw-census --metrics --assert --out "s6/$P-$F-$W-$H-$T-$M.png" --json "s6/$P-$F-$W-$H-$T-$M.json"
```
Record **actual eligible/admitted counts**: this is the dense **320-cap** matrix, not proof of 320 rendered hulls. Synthetic 320 placement/batch tests cover capacity; an actual 320 GPU claim requires a separately approved S9:lookdev 320-node snapshot, clearly labelled synthetic. No fabricated live identities.

**B:** Selection, LOD transitions and cloth:
```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture dense --ship-limit 320 --hash '#sel=ship.usdc-circle&t=18.5' --overlap --burst 9 --interval 600 --burst-sheet --out s6/P-selected.png --json s6/P-selected.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture dense --ship-limit 320 --hash '#t=12.25' --pan-zoom --overlap --out s6/P-lod.png --json s6/P-lod.json
```
Repeat B for the actual smallest eligible ID and one represented member of each exemplar family. Repeat accepted final matrix under S9:M5-calibration; timer-query readings are not assumed portable costs.

## Operator decisions required
1. **Leader emphasis:** retain executable compressed scale and use berth/rig/mark hierarchy, or authorize a separately taught bounded leader-size bonus? Recommend **no size bonus initially**; saturation is real, but arbitrary enlargement is not cap-proportional truth. Revisit only after matched leader-identification review; any bonus must migrate berth, picking, labels and motion margins together.
2. **Three masses versus per-band arithmetic:** approve projected global masses with legal band-clipped lobes, or retain 3/5/7 per band? Recommend the projected grammar; keep capacity/safety absolute.
3. **Only if full-hull dense composition fails:** keep improving placement/LOD, or change the one-coin/one-visible-object contract to count-bearing, inspectable long-tail groups? Recommend **no aggregation now**. Approval must amend Contracts `264-277` and VI `8,44`, conserve member counts/cap, expose every constituent in DOM/search/keyboard, and immediately expand a selected member; this is a separate gated alternative, not an overflow fallback hidden in P1.

## Out of scope / do-not-do
No risk reassignment, fake supply-area chart, runtime aggregation, remote models, WebGPU switch, new cloth atlas, universal brighter lamps, erased identities, renderer-only placement offsets, extra independent motion clocks, or all-fleet material micro-tuning. No checks/builds/browser sessions were run for this specification.
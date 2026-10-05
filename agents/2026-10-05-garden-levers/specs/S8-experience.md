# S8 — Experience layer

## Lever statement
Replace a harbour fly-in and disconnected controls with a task-ready garden threshold, an inspectable stroll, and intimate living/sounding places. Visitors understand the reading before waiting for atmosphere, then inspect without being expelled from their viewpoint. This changes inhabitation, not merely easing or decoration.

## Verified current state
- `index.html:18-57,76-78` paints a local-hour gradient into an empty root; `src/client.tsx:94-116` gates before import and supplies anonymous loading text.
- `src/systems/garden-arrival.ts:11-18` prescribes 9 seconds, a 3-unit rise and 1.8× air; readiness/input safeguards exist (`src/pharosville-world.tsx:1121-1165`). Keep the separate crossing ceremony (`garden-arrival.ts:31-50`), not this introduction.
- Existing sheet roles are clock-only (`src/systems/chrome-air.ts:84-103`), but legacy panels/search use purple/gold (`src/pharosville.css:1113-1128,1303-1335,1724-1726`). Duplicate entrances occur at `:1402-1444`. Explore displays `/` (`src/components/world-controls.tsx:180-190`); `/` actually opens Find (`src/pharosville-world.tsx:1037-1046`).
- Six cards hold over a rest hand-off rig (`src/systems/postcards.ts:68-132,171-181`); capture-phase input consumes interaction and returns home (`src/hooks/use-canvas-resize-and-camera.ts:607-626`). Selection stops at first zero-cost candidate (`src/systems/camera.ts:1124-1135`), with no panel/sky/context score. Details wait until 70% glide (`src/pharosville-world.tsx:484-487`), contradicting CONTRACTS:301.
- Fish rings have zero admission width (`src/systems/garden-score.ts:452-458`); expiry precedes start checking (`:655-661`). Koi loop/fade (`src/three/garden-koi.ts:77-109,269-272`); heron daylight residency already survives missed flights (`src/three/garden-heron.ts:560-567`). Global sway is not spatial gust sampling (`src/three/garden-flora.ts:525-537`); canonical caller is `src/three/world-renderer.ts:3991`.
- Bed is shore-centric (`src/lib/pharosville-audio/bed.ts:82-89,188`); consent is explicit/lazy (`src/hooks/use-garden-sound.ts:70-76`). `public/og-card.png` visibly says island-city. L12's initial silence is foreground-only (`src/systems/garden-director.ts:155`), not a blanket fauna gate. Still images do not prove temporal/audio quality.

## Target state
At ready, the accepted garden rest frame is already composed; identity, Lighthouse/Water/Sails key and scoped health coexist. Day has porous foliage and discoverable residents; night has readable habitat and ink-sheet UI, not forced nocturnal animals. At 1200×640 and 900×720, edge rows and panels never collide. Stations retain inspection context. Reduced motion supplies the entire picture and instant navigation cuts, without continuous RAF. Sound remains optional.

## Shared execution contract
`C` = `docs/pharosville/CONTRACTS.md`; `V` = `docs/pharosville/VISUAL_INVARIANTS.md`; `T` = `docs/pharosville/TESTING.md`. File lists below are primary implementation owners; named tests/docs are additional amendments. Budget deltas are planning allowances, **not measurements**: total ≤10.5 KiB gzip, +1 call/+400 triangles/0 textures, excluding S1/S7 art already charged there. Respect T's 700 calls/500 geometries/500k triangles/72 textures and unchanged bundle ceilings throughout travel, not only endpoints. Integrate shared preview changes once. Rollback means atomic packet revert, never permanent old/new runtime switches.

## Ordered packets

### S8-P1 · Task-ready arrival and capture instrument · M
**Files:** `index.html`; `src/client.tsx`; `src/systems/garden-arrival.ts`; `src/pharosville-world.tsx`; `src/hooks/use-canvas-resize-and-camera.ts`; `scripts/pharosville/preview.mjs`.
**Change:** Put branded heading, generic encoding guide, actual loading stage and analytics links in first-byte HTML; React replaces it without a blank interval. No fake progress or pre-runtime live claims. Reveal rest immediately after existing data/warmup/preference readiness; remove intro rise/extra haze and obsolete samplers/callers. Allow ≤200 ms non-spatial veil settling, interruptible without swallowing input; explicit URL intent wins. Integrate S3's independent key, not a caption timer.
Add navigation-relative filmstrip before canvas/fleet waits; record nominal/actual capture offsets, first meaningful DOM and first complete-world timestamps. Add fixed DOM-action states `key|sources|find|controls|light|legend|ledger|changelog`, aliases `--reading-key`/`--source-details`, shell modes and later station/path sampling. A nominal zero shot records actual response-commit latency, not fabricated first-byte timing.
**Amend:** C Runtime; V Atmosphere/Motion; T Instruments/startup; `public/_headers` CSP if inline bytes change. Delete intro rise/6-second-air pins in `garden-arrival.test.ts`; rewrite hook/world arrival tests for immediate pose, resize and interruption; retain ceremony/CSP tests. Add `scripts/pharosville/preview-experience.test.mjs` timing/flag tests.
**Budget:** +1 KiB JS; GPU zero (DOM/tooling replacement).
**Acceptance:** A1; `npm test -- src/systems/garden-arrival.test.ts src/client.test.tsx src/hooks/use-canvas-resize-and-camera.test.ts src/pharosville-world.test.tsx`; `node --test scripts/pharosville/preview-experience.test.mjs`. Healthy/degraded first visits teach simultaneously; blocked/no-JS/module-failure show working identity/links.
**Depends:** S3-P3/P6, S9:lookdev, S9:invariant-rewrite. **Risk/rollback:** shell duplication or false readiness; revert introduction only, preserve key truth.

### S8-P2 · One ink-and-sheet edge system · M
**Files:** `src/pharosville.css`; `src/components/world-controls.tsx`; `src/components/quick-find.tsx`; `src/components/accessibility-ledger.tsx`; `src/pharosville-world.tsx`; `src/systems/chrome-air.ts`.
**Change:** Migrate quick-find, ledger and changelog CSS to paper/ink/quiet/link roles; retain existing day/night sheets, fonts and lazy panels. Replace nested ornamental frames with fine rules/typographic groups. Keep one 200 ms panel entrance and reduced-motion override. Never interpolate ink/sheet polarity through unreadable mid-tones. Make Find `/`, Explore expansion and Read key distinct discoverable actions; remove duplicate hidden Find. Use one intrinsic edge grid for reading/health/actions, wrapping to two rows at both gates; remove caption fade-mask as overflow management. Preserve 44px targets, combobox semantics, focus restoration and single ledger body.
**Amend:** C Runtime chrome/labels; V Hierarchy/DOM; T expanded-chrome matrix. Delete duplicate `pv-panel-enter`; rewrite Explore shortcut assertions, preserve keyboard/ledger parity tests.
**Budget:** +0.5 KiB JS; GPU zero, no fonts/library additions.
**Acceptance:** A2; `npm test -- src/components/world-controls.test.tsx src/systems/chrome-air.test.ts src/components/accessibility-ledger.test.tsx`. Capture every named state with long health copy, selected record and keyboard focus; composited text ≥4.5:1 throughout clock transitions.
**Depends:** P1, S3-P3 (S3-P2 declined: the edge grid lays out the unchanged caption, whose warning precedence stays exclusive, beside the reading key and actions; no `Sources` health action). **Risk/rollback:** excessive chrome/night hierarchy; revert layout/styles together.

### S8-P3 · Connected, inspectable stroll · L
**Files:** `src/systems/postcards.ts`; `src/hooks/use-canvas-resize-and-camera.ts`; `src/hooks/camera-intent.ts`; `src/components/world-controls.tsx`; `src/pharosville-world.tsx`; `scripts/pharosville/preview.mjs`.
**Change:** Evolve six existing IDs into an ordered route with station title, prev/next/home and authored local bounds. Reauthor eyes/targets against accepted shore/precinct anchors; connect adjacent views using explicit waypoints and piecewise smooth eye/target paths in `camera-intent.ts`, reusing existing station/sight probes, not universal flyover arcs. Sample clearance against terrain/station massing at ≤0.5-world-unit travel increments; water eye clearance ≥1.7 units, land clearance ≥0.8. Selection saves station-local pose; Escape closes selection back there, Home alone returns seat. Wheel/drag hand off locally with <1px grabbed-point jump; unrelated chrome input never ends station. Interrupt at current displayed pose; resize re-solves it. Reduced motion cuts; no auto-advance/orbit. Extend P1 driver with `--station` and shared-path `--path-progress`.
**Amend:** explicitly replace C Media and motion K44:427-432; V Picture/Motion. Delete forced-home test branch (`use-canvas-resize-and-camera.test.ts:127-131`), rewrite book-cycle to prev/next/local-return; retain no-auto/reduced tests and postcard sightline assertions.
**Budget:** +3 KiB JS; GPU zero; close LOD costs charged S6.
**Acceptance:** A3; `npm test -- src/systems/postcards.test.ts src/hooks/use-canvas-resize-and-camera.test.ts`. All six stations and 0/.25/.5/.75/1 paths pass clearance, local click/wheel/selection/Escape/Home, resize and reduced cuts.
**Depends:** P2, S1-P3, S7-P4. **Risk/rollback:** low views expose unfinished art; revert route/control semantics together, not disable inspection.

### S8-P4 · Panel-aware subject tableaux · M
**Files:** `src/systems/camera.ts`; `src/hooks/use-canvas-resize-and-camera.ts`; `src/pharosville-world.tsx`; `src/components/detail-panel.tsx`; `src/pharosville.css`; `src/hooks/camera-intent.ts`.
**Change:** Render details immediately; remove hidden/inert/opacity gating on camera arrival; measure actual panel rectangle with ResizeObserver, including expanded record. Reject eye/path/silhouette obstruction first, then score bounded candidates for panel exclusion plus 24px padding, subject identity span, neighbour separation, sky occupancy (target ≤35%) and visible shore/tower context. Permit elevated three-quarter views; contextual landmark is subordinate, never mandatory behind blocked terrain. Retain current pose when valid; deterministic tie-break, no per-frame search/allocations. Use P3 clearance paths for remote subjects; moving follow uses final displayTile and bounds.
**Amend:** C Fleet capacity/camera:298-302; T selection matrix. Rewrite hook's 70%-reveal and world hidden/inert tests to immediate DOM disclosure, retain eased exact landing; add `src/systems/camera-tableaux.test.ts` candidate/panel cases rather than first-yaw pins.
**Budget:** +2 KiB JS; GPU zero.
**Acceptance:** A4; `npm test -- src/systems/camera-tableaux.test.ts src/hooks/use-canvas-resize-and-camera.test.ts src/components/detail-panel.test.tsx src/pharosville-world.test.tsx`. USDC, smallest hull, moving hull, edge berth, dock and grave: unoccluded identity/water, immediate facts, interruption and local restoration.
**Depends:** P2/P3, S6-P1/P2. **Risk/rollback:** oversized inspection implies rank; keep enlargement explicitly a viewing condition; revert solver only.

### S8-P5 · Reliable gifts and living materiality · M
**Files:** `src/systems/garden-score.ts`; `src/three/garden-koi.ts`; `src/three/garden-heron.ts`; `src/three/garden-flora.ts`; `src/three/garden-threshold.ts`; `src/three/world-renderer.ts`.
**Change:** Set generated fish rings' `windowSec` to named **1-second admission window**, preserving half-open expiry and played IDs. Include window+hold in sunset/noon exclusion and quiet-check endpoint; do not change zero-width companions globally. Expired/busy windows drop, never replay.
Replace koi figure-eight/station loops with seeded bounded travel/pause/turn segments on canonical clock; preserve four fish, one heron, daylight presence and scored flights. Recompose near-edge pond paths/heron station for the tea/rest sightlines, not brighter animal glows.
Consume S1 `aGardenFlex` vec3 and `aGardenRootIndex` 0/1: sample `gardenGustAtWorldPosition` twice per frame for cached world roots into two gust uniforms; merged foliage selects its root and trunk/branch/tip flex. Migrate threshold/renderer timeSeconds calls end-to-end. No per-vertex uploads/second wind clock; reduced motion fixes complete poses.
**Amend:** C Media/life/score; V Motion; T natural-vs-forced evidence. Preserve population/budget tests; rewrite loop-position pins in koi tests, add generated-window driver tests before/inside/exact-expiry, repeat, missing handler and hidden resume.
**Budget:** +1.5 KiB JS; GPU zero beyond S1 geometry.
**Acceptance:** A5; `npm test -- src/systems/garden-score.test.ts src/three/garden-koi.test.ts src/three/garden-heron.test.ts src/three/garden-flora.test.ts src/three/garden-threshold.test.ts`. One generated natural admission, no catch-up; readable habitat, distinct pause/turn states and downwind flex ordering in 90-second clips.
**Depends:** S1-P3, S7-P4, S4-P1. **Risk/rollback:** toy wobble/choreography; revert sampler/motion, retain ring fix independently.

### S8-P6 · Garden acoustic foreground · M
**Files:** `src/lib/pharosville-audio/bed.ts`; `src/lib/pharosville-audio/engine.ts`; `src/lib/pharosville-audio/scene-snapshot.ts`; `src/lib/pharosville-audio/mix.ts`; `src/three/garden-island.ts`; `src/systems/garden-observatory-slice.ts`.
**Change:** Replace south triad companion `(3.8,6.75)` (`garden-island.ts:1272`) with grounded bowl/spout, not the gull's landing stones. Export hydraulic anchor; store eye coordinates through existing snapshot writer. Replace some near lap energy with quiet basin drips exciting damped inharmonic modes; replace some wind hiss with foliage rustle sampling shared root gust. Reuse lap/wind buses, existing noise/reverb/voice accounting; distance/pan and shelter attenuation follow actual source/listener. Sound off means no load/context; Music remains separate. No market-direction mapping, metronomic knock or alarms.
**Amend:** C displacement/sound:457-484; T audio audition. Rewrite `garden-island.test.ts:371-403` to a three-member stone/basin ensemble with grounded bowl; add `src/lib/pharosville-audio/bed.test.ts`, preserve consent tests and −6 dBTP/six-voice ceilings.
**Budget:** +2 KiB lazy JS; ≤1 call/400 triangles/0 textures for wet bowl, batch stone/spout.
**Acceptance:** A6; `npm test -- src/lib/pharosville-audio/bed.test.ts src/hooks/use-garden-sound.test.tsx src/three/garden-island.test.ts`. Save stem/peak report plus headphone/speaker audition, consent/hidden/resume/Still captures; no pre-consent audio requests. Offline forced score is audition, not natural evidence.
**Depends:** P5, S7-P4. **Risk/rollback:** synthetic costume/transient; revert basin and corresponding audio together.

### S8-P7 · Small-screen edition and truthful social card · M
**Files:** `src/client.tsx`; `src/desktop-only-fallback.tsx`; `src/rotate-to-landscape.tsx`; `src/pharosville.css`; `index.html`; new `scripts/pharosville/generate-garden-social.mjs`.
**Change:** Welcome with brand, accepted still, encoding guide and useful analytics links; explicitly label illustration/not live readings. Size guidance is secondary; never claim embedded tables. Bake portrait/landscape crops of five beats, regenerate `public/pharosville/stills/garden-{dawn,day,golden,blue,night}[-portrait].{avif,jpg}` ≤90KB each, and 1200×630 `public/og-card.png` from accepted art with current garden promise/alt text. Generator uses local inputs/fonts and dev capture tools, no runtime dependency. Image failure leaves useful DOM. Renderer failure retains WorldStaticOverview, never a still substitute.
**Amend:** C Runtime gate; T Hour stills; `docs/pharosville/GITHUB_MEDIA.md` Current Assets/Provenance; client copy/asset tests and `functions/index.test.ts:238` alt pin rewritten, retain no-import assertions; new generator input/output tests.
**Budget:** +0.5 KiB JS; GPU zero; only chosen crop transfers, no desktop still preload.
**Acceptance:** A7; `npm test -- src/client.test.tsx src/systems/viewport-gate.test.ts functions/index.test.ts`. Review 390×844, 844×390, capable-but-small viewport, failed image and OG thumbnail; blocked cases request no world/API/GLB/logo resources.
**Depends:** S9:destination, S1-P3/P4, S4-P1/P2, S7-P4, S9:M5-calibration. **Risk/rollback:** stale crop promises; revert assets/copy as one release unit.

## Capture acceptance recipes
Run serially, real GPU; all outputs under `outputs/s8/`. **New flags above require P1/P3 implementation; they do not exist today.** Repeat applicable captures at both gate sizes, their rotated companions, noon/night and reduced motion. Panel states each get separate runs. Capture playable video/audio separately; stats/filmstrip are not recordings.

```sh
# A1
env -u CI npm run preview -- --url http://localhost:5173 --headed --first-visit --fixture quiet-dense --cold-filmstrip 0,0.5,1,2,4,6,9,12 --out s8/arrival.png --json s8/arrival.json
# A2: repeat --experience-state for every declared panel/control state
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1200 --height 640 --hash '#t=12.25' --experience-state ledger --out s8/ledger.png
# A3: repeat station IDs and path fractions
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 900 --height 720 --station chaseki-bench --path-progress 0.5 --out s8/stroll.png
# A4
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 900 --height 720 --hash '#sel=ship.usdc-circle&t=22' --reduced --out s8/tableau.png
# A5: natural clock, no t= pin; schedule/visibility must accompany the recording
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05T08:00:00 --hash '#' --still-camera --stats --watch-seconds 1800 --tail-seconds 1800 --out s8/life.png --json s8/life.json
# A6: collect downloadable audition and peak report; separately click Sound for natural listening
env -u CI npm run preview -- --url 'http://localhost:5173/?debug=1&audio=record:60' --headed --hash '#t=12.25' --seconds 120 --out s8/audio.png
# A7: repeat no-js/module-failure and portrait/landscape
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 390 --height 844 --capture-shell blocked --out s8/small.png
```

## Operator decisions required
- Branded gradient or desktop pre-runtime still? **Gradient**, avoiding false-live imagery/transfer.
- Accept inspectable six-station route replacing K44? **Yes**, operator approves station/path plates before cutover.
- Basin modal synthesis or local recording? **Modal**, subject to blind audition; replace shore energy, not add loudness.

## Out of scope / do-not-do
No autoplay, free orbit, compulsory Enter splash, extra fauna, distress alarms, remote assets, second renderer or orientation admission. Keep same-origin `/api/*`, server-only PHAROS_API_KEY, DOM/ledger analytical parity, colour-independent meaning and release exclusively through `.github/workflows/release.yml`. No checks were run for this read-only specification.

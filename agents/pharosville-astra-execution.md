# Astra refinement execution

Objective: fully execute [the refinement plan](./pharosville-astra-refinement-plan.md).

Started 2026-09-05 at `8566b38`. The original plan is the scope; conditional
experiments require evidence, and a justified no-change result must be recorded.
Status: implementation and local acceptance complete on 2026-09-05. Conditional
experiments were assessed; deferred work and measurement limits are recorded below.

| Item | State | Evidence / remaining work |
| --- | --- | --- |
| E1 static siting | Implemented; verified | Immutable areas-reference WeakMap; real live 185-ship hit-target work now 0.2 ms versus reviewed 6.1–7.2 ms |
| E2 GLSL ramps | Implemented; verified | Ten descending ramps corrected; affected shaders compile on M5 Pro Metal |
| E3 live freshness | Implemented; verified | 30-second visible-page aging, tab-return refresh, header/body age reconciliation |
| E4 body resilience | Implemented; verified | Client 15s/proxy 8s deadlines cover bodies; caller abort and last-good fallback |
| E5 critical payload/cache guards | Implemented; verified | Render-critical network and restored-storage shape guards |
| E5 world memo | Implemented; verified | Explicit React dependencies replace custom identity signatures |
| E5 edge cache failures | Implemented; verified | Nonfatal normal reads, observable normal writes |
| E5 caught component errors | Implemented; verified | Existing deduplicated reporter and reload recovery |
| E5 canary | Implemented | Strict scheduled freshness check, retry after five minutes; deployed report-cards currently 404 |
| E5 module boundaries | Completed narrowly | Texture owner census extracted as touched coherent measurement unit; no general renderer reorganization |
| G1 water continuity | Implemented; verified | All regional deviations ease to shared seam state, IDs unchanged; day/night/overview/pan review retains softer water seams |
| G2 static/berth composition | Implemented; verified | Authored risk-anchor static tableau; local hull-clearance preference, original water-safe fallback; actual 320/321 allocation and live 185 build pass; matched overlap diagnostic improves at laptop and overview |
| G3 foreground pine | Implemented; verified | Articulated trunk/branches, unequal foliage lobes, smaller hero; hardware silhouette review passed |
| G4 rim transitions | Implemented; verified | Continuous earth, local ledges, welded normals, broad material gradients; hardware review shows quieter shore bands |
| G5 material character | Implemented; verified | Normalized per-vertex roughness/metalness preserves GLB sources; fixed interleaved GLB accessor stride; complete arrays match Three GLTFLoader |
| G6 reflection/contact basis | Implemented | Common camera-aligned reflection basis; centered ambient hull contact discs; retained after day/night review |
| G7 signs/selection/light | Implemented; verified | Ship and harbor cold-link framing; ready-only details; smaller two-line sea signs and quieter night ink; hardware review passed |
| G8 depth blur / LOD / reflection experiments | Assessed; targeted LOD fix retained | Visible pine pop now fades with existing detail value; no demonstrated depth halo or need for another reflection effect |
| U1 modality/focus | Implemented; native browser checks pass | Native dialogs, hidden/inert selection readiness; Chromium and Firefox native focus/deep-link checks pass |
| U2 discoverability | Implemented; native browser checks pass | Find, first-Tab skip map, truthful note/freshness; harbor ties wording; native browser interaction checks pass |
| U3 light/Still controls | Implemented; native browser checks pass | Native time input, Local time reset and Still; OS preference remains minimum; browser and real-GPU light-cycle checks pass |
| U4 reading/ledger/tour | Implemented; verified | Reading inhibits attract and resets 120s delay; ledger jumps/disclosures/select; captions explain rankings |
| GPU timing / upload optimization | Assessed; no speculative optimization | No expensive new passes or measured upload bottleneck; timer-query capability reported |
| Estimated resource bytes | Implemented; 24 focused tests pass | Reachable/live texture and depth/MSAA renderbuffer estimates; unknowns/exclusions explicit; not VRAM |
| Full acceptance matrix | Passed | 1,900 unit tests; 18 Chromium production checks; 2 Firefox accessibility checks; real-GPU animated/static arms passed |

At the implementation handoff, no commit, push, deployment or release had been performed.

## Integration decisions

- Permanent exclusive envelopes for every possible dock visit were rejected:
  the 132-ship fixture passed, but the live 185-ship feed and true 321-ship
  assignment exhausted all map water. Final allocation prefers an envelope-clear
  local slot and retains the original unique, water-safe-center fallback. This
  preserves route capacity and sticky positions. It does not claim collision-free
  animated mooring: visits occur at different times and hulls turn during cast-off.
  Family envelopes are conservative procedural estimates, not exact loaded-hero
  bounds. The experimental 46.67-tile overflow maximum is not final behavior.
- Wider berth candidates exposed a real lateral-lane flip at path hairpins. A
  symmetric one-tile path chord now makes the lateral offset continuous; original
  continuity thresholds remain intact. Motion/slice tests: 115 passed.
- Two independent camera lifecycle fixes were needed: preserve explicit URL
  selection while loading, and avoid cancelling a new selection intent from the
  passive selection-change effect. Native Chromium verifies camera, panel and focus.


## Matched visual and hardware evidence

All appearance judgments use `npm run preview`, operator Chrome, ANGLE Metal on
Apple M5 Pro. Fixture captures use the checked-in 132-ship dense payload, camera,
light and viewport recorded in each JSON/log. A Date-only freeze retains native
`performance.now`, RAF and timers. Earlier fixture captures made with Playwright's
clock shim are valid composition references only; their frame timings are discarded.

- Static overview projected hit-rectangle overlap pairs: **349 → 229**, with 132
  visible ship targets in both images. Laptop: **74 → 31**, with 65 → 69 targets.
  This is a geometry proxy, not sail-pixel occlusion or proof of zero overlap.
  Compare `outputs/astra-before-overview.png` / `astra-after-overview.png` and
  `astra-before-laptop.png` / `astra-after-laptop.png`.
- Full-quality day/night, 900×720, 1200×640, 900×1200, 1600×1000, 2560×1080 and
  DPR 2 captures pass resource/static gates. Compact/tall controls remain visible;
  full-quality daytime and nighttime water retains a broad calm area. The night
  blur audit keeps the beacon dominant. See `outputs/astra-gpu-matrix-results.json`
  and `outputs/astra-after-*.png` / `.json` / `.log`.
- The selected Tether capture now centers a recognizably wooden ship and a readable
  record. The custom loader previously read RGB and normal padding as components;
  it affected the original reviewed revision too. Regression tests compare every
  runtime model's complete positions, normals, colors and indices against the
  installed reference GLTFLoader, then check the merged Tether attributes.
- The pine appeared abruptly at the overview/detail crossing. Its existing batch
  now fades with the existing LOD value, at fixed placement, without added draws.
  Pan/zoom captures show the transition. No convincing mast/bright-water depth-blur
  halo was found; keep the current blur. A new silhouette reflection or another
  screen-space effect has no demonstrated need after the coordinate/asset fixes.
- Full live 185-ship night capture: **60 fps, worst-window p95 16.8 ms**, no sampled
  long tasks; 252 calls, 339,870 triangles, 231 geometries, 42 textures. Source:
  `outputs/astra-final-live-night.log`. CPU sample/hit/draw costs are not GPU timers.
- Dense 180-second native-clock sweep: full tier, worst-window p95/p99 16.8 ms,
  but an isolated **683.3 ms** worst frame. A separate 30-second probe localizes a
  **983.3 ms** outlier to the first measurement window; the following 38 windows
  stay at ≤16.8 ms maximum. It does **not** establish stutter-free startup. Long-task
  retention is shorter than frame retention, so zero reported long tasks does not
  identify the cause. No speculative fix or weakened gate was applied. Evidence:
  `outputs/astra-native-outlier-probe.json`.
- Estimated dense-day logical storage: 152.78 MiB reachable / 129.83 MiB live-handle
  textures; 151.01 / 149.48 MiB depth/MSAA renderbuffers. These exclude driver
  padding/pooling, default framebuffer and unattributed allocations. They are not
  measured VRAM. Timer-query support is reported, but no GPU-pass timer pipeline
  was added because no expensive rendering experiment was justified. Buffer dirty
  ranges likewise remain unchanged without measured upload pressure.

## Additional findings and acceptance limits

The constrained-tier stress image passed numeric gates but lost opaque scenery.
Cold constrained mode had never allocated its shadow map yet left the directional
light caster enabled. It now disables that caster with the existing shadow tier,
removing the invalid comparison sampler. `outputs/astra-constrained-fixed.png` shows
the full opaque scene restored; 226 calls, 275,912 triangles, 229 geometries,
28 textures. Cold constrained → recovery → constrained has a regression check.
Entering/leaving constrained changes the shadow shader variant; other tiers
continue sharing shadow support.

Cold harbor selection used the same URL-follow intent but was excluded by a
ship-only guard. Docks now use the existing camera/onRest pipeline too. The final
harbor frame centers Ethereum with clear panel margins: 118 calls, 212,601
triangles, 177 geometries, 48 textures (`outputs/astra-harbor-fixed.png`). Regression
checks cover loading → ready in normal and reduced motion for ships and docks.

`npm run validate:release` passed in full, including both measured real-GPU arms
(`outputs/astra-final-release.log`). All eight renderer performance correctness checks also pass
(`outputs/astra-final-perf.log`). No code change to a cap or percentile threshold was made.

No cross-vendor GPU is available in this session. The deployed report-cards
endpoint returned 404 during the live probe; local fixture acceptance does not
repair that upstream state. No deployment was requested or performed during the implementation phase.

Remaining UX limits are explicit: when a Changelog trigger has been unmounted,
focus returns to the world; ledger selection actions cover ships and stations,
while area/grave facts remain available as text. Reading protection is verified
with fake time and native interaction checks, not a two-minute browser dwell for
every dialog. The error boundary's synchronous failure regression exercises its
shared catch/report/reload path; a separate lazy-import rejection was not injected.

The release run exposed a pre-existing platform error in the correctness harness:
its forced Vulkan backend selected SwiftShader on macOS. A renderer-label-only
probe confirmed Metal selects the M5 Pro. The shared browser configuration now
selects Metal on Darwin and preserves Vulkan elsewhere, including existing
CI/explicit opt-out behavior. Guard checks cover that choice. The interrupted
software-renderer run is not acceptance evidence; assertions and timeouts were
not relaxed. Appearance and reference timing still come only from `npm run preview`.

## Final integrated checks

- `npm run validate:release`: **PASS**, 165 test files / 1,900 tests, two existing
  skips; typecheck/lint, guard/viewport/asset/header/release-contract checks, build
  and bundle limits pass. Production Chromium: 18 checks; Firefox accessibility:
  two checks. Documentation has nine existing non-blocking age warnings.
- Real live release arm: full tier, worst-window p95 16.8 ms, worst sampled frame
  16.8 ms; 248 calls, 337,182 triangles, 226 geometries, 42 textures. Settled static:
  229 calls, 337,840 triangles, 212 geometries, 42 textures, zero continuous RAF.
- Final bundle: renderer 428.4 KiB raw / 140.6 KiB gzip; total JavaScript
  2,596.0 KiB raw / 825.0 KiB gzip. Existing caps are unchanged; no dependency added.
- `node --test scripts/pharosville/preview-fixture.test.mjs`: three checks pass,
  including native timer identity under the Date-only fixture freeze.

The separate resource suite then identified duplicate shield buffers being uploaded
as a ship entered view. Two identical `ShapeGeometry` instances per badge are now
one geometry in the existing fleet cache, shared across all shields and their
marks. Materials, transforms, draw count and triangles are unchanged. The focused
stability check improves from 274→276 geometries (range 2) to a flat 225 (range 0),
removing 51 duplicate resident buffers. Reference-sharing and exactly-once disposal
are regression-tested. Earlier GPU tuples above predate this final deduplication;
the final validation logs record the resulting lower geometry counts.

Final severe-weather and calm captures also pass and were visually inspected:
`outputs/astra-final-storm.png` and `outputs/astra-final-calm.png`. The severe
fixture retains the beacon as the focal light through heavy haze; the sparse
static fixture retains broad quiet water and visible area distinctions. Severe
full-quality night: 285 calls, 279,799 triangles, 229 geometries, 42 textures,
worst-window p95 16.8 ms. Its isolated 716.6 ms maximum remains consistent with
the documented startup-window limitation, not a stutter-free claim.

The final command record is `outputs/astra-final-validation.json`: release,
eight-test performance suite, severe weather and calm all exit 0. All screenshots,
logs and probes stay in ignored scratch output. The maintained dev server remains
at `http://localhost:5173/`; the isolated baseline server has been stopped.

Implementation was delivered for code and art review before publication. The
operator subsequently authorized thematic commits, changelog and release; that
publication follows `docs/pharosville/RELEASES.md`.

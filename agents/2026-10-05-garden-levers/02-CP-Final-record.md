# CP-Final — Garden Observatory

Branch `feat/garden-observatory`, forked from `main` at `ccbfca8`.
Plan: `agents/2026-10-05-garden-levers/00-implementation-plan.md`.
Authoritative overrides: `agents/2026-10-05-garden-levers/01-execution-overrides.md`.
Destination gate: `agents/2026-10-05-garden-levers/destination/CP-Destination-orchestrator-gate.md`.

## Verdict

The programme is complete and green. `npm run validate` and
`env -u CI npm run validate:release` both exit 0 — typecheck, lint, 2,574
unit and contract tests, the guard scripts, the production build, the bundle
budgets, and the built artifact's DOM and accessibility contract in Chromium
and Firefox.

## What shipped

The main lever was one approved whole-frame hierarchy: an inhabited garden
threshold in the near ground, a quiet inlet, a dominant Pharos, and unequal
fleet masses. Every packet served that hierarchy or the reading of the data.

- **S1 — threshold garden.** An authored seat garden: bank planes, the stone
  triad, the record plane and a kuromatsu rebuilt from screen-pad sprites into
  parent-attached tapered trunk and branch graphs with closed needle masses.
- **S2 — material grammar.** One shared surface vocabulary and a generated
  detail atlas owned by the renderer and leased by consumers; canonical merge
  preparation for timber, plaster, tile and stone.
- **S3 — data grammar.** A reading key with real exemplars, a dated PSI record
  with a shared DOM table, and the issuance contract repaired at its boundary.
- **S4 — light.** Analytic daylight with altitude-integrated scattering, zonal
  irradiance, and a solar-disc radiance budget that bounds low-sun transport.
- **S5 — water.** A static signature codebook, world-registered substrate
  absorption, sparse exposure-gated lap, and unified horizon transport.
- **S6 — fleet.** Projected composition into three unequal shore-following
  masses, pixel-footprint LOD that keeps every hull drawn and pickable,
  selection-independent resting headings, and rebuilt vessel families.
- **S7 — coast and architecture.** A four-sided coast, a geological headland,
  and an architecture kit adopted by every station and veranda.
- **S8 — experience.** A branded first-byte arrival, one ink-and-sheet chrome,
  a six-station stroll, panel-aware selection tableaux, resident ecology,
  consent-first place-true sound, and an honest small-screen edition.
- **S9 — pipeline.** Lookdev plumbing, a breath-independent shadow camera, and
  performance evidence that separates the resting steady state from refresh
  frames instead of averaging them together.

## Defects found by real-GPU capture and fixed

Every one of these was invisible to the test suite and was found only by
capturing real frames on the operator's GPU and measuring their pixels.

| Defect | Cause | Fix |
| --- | --- | --- |
| Black screen at night | `GARDEN_RISK_SURFACE_GLSL` produced NaN | NaN-safe surface math |
| Every `applyGardenSurface` material failed to link | a literal `\nuniform vec2 …` emitted into source | corrected injection |
| Water failed to compile | `fieldDepth` used outside its declaring scope | restored main-scope declaration |
| Opaque black rectangles flashing over the world | non-finite HDR samples convolved through the bloom pyramid; `fwidth` after non-uniform `continue` in the sail and water shaders; `fwidth` after `discard` in smoke; unclamped koi Fresnel `pow` base | derivative ordering repaired at each source, plus a bloom prefilter guard as defence in depth |
| Dawn and golden hour desaturated to one tint | duplicate low-sun blending, baked then re-mixed | single analytic blend |
| A white halo erased the lighthouse | grazing HG radiance entering air and PMREM; depth-blind bloom | solar-disc radiance budget, depth-aware bloom |
| White blocks on the tower face | print-ink remap divided signed radiance by a near-cancelled luminance behind a `1e-8` floor, producing ~1,000 HDR spikes | bounded, nonnegative, peak-normalised remap |
| `hero-wood` and `hero-spar` never linked | `metalnessFactor` assigned before `metalnessmap_fragment` declared it | injection moved after the chunk |
| A hard diamond seam across the basin | horizon airlight applied to the annulus only | world-distance transport shared by plate, skirt and annulus |
| A white band painted across the shore | rim geometry used a waterline datum 1.34 units above the rendered sea | shoreline tied to the rendered water datum |
| Two `<h1>` elements with the same accessible name | arrival and fallback titles competing with the app heading | welcome titles demoted to `<h2>` |
| `#n=1` in a shared link painted a night veil at noon | the `t`/`n` levers were not localhost-gated like `d=` | gated, CSP hash recomputed |

## Measurements

- Resting census at the seat view, 1600×1000: 178 recurring calls
  (176 scene + 2 offscreen), 359,857 triangles, 168 geometries, 51 textures.
  Caps are 700 calls, 500 K triangles and 72 textures.
- Overview: 131 calls, 285,051 triangles, 44 textures.
- Reduced motion: 166 calls, 0 offscreen, a settled static frame.
- Bundle: 3,069.4 KiB raw / 985.2 KiB gzip against the earned 1,024 KiB cap.
  The renderer chunk and the frame-time gate were not relaxed.

## Declined, and why

- **S3-P2 scoped source health** — declined by the operator. The caption keeps
  exclusive warning precedence; there is no per-source health action.
- **D6d re-teach** — declined. A visitor already marked seen is never re-taught,
  and the existing storage key is unchanged.
- **S4-P6 conditional contact softening** — evaluated and not built. The
  installed five-tap PCF already grounds the reviewed foreground, and the
  specified 8+16 blocker search costs 24 fetches per shaded fragment against a
  ceiling of no measurable regression. It reopens only on an operator-reviewed
  grounding failure on calibrated hardware.
- **Fleet zoom-thinning** — retired. Far batches carry the hierarchy at 40
  triangles each and every hull stays drawn and pickable.

## Still outstanding

- **M5 Pro calibration** and the **twelve-person blinded reading test** could
  not be run: the hardware and the people were unavailable. Nothing in this
  record depends on either, and no claim here asserts them.
- Three water bands (watch, danger, ledger), four lighthouse states and the
  cloud slot have **no reading exemplar** in the supported fixtures at the
  authored camera. They are marked pending in
  `agents/2026-10-05-garden-levers/destination/reading-atlas-crops.json`, with
  the derivation recorded, and the key degrades to text for them rather than
  publishing a misidentified crop.

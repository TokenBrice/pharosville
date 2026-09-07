# PharosVille visual refinement — consolidated plan

Date: 2026-09-07. Branch: `feat/garden-atmosphere-pass` (base `52c7e12`).
Source: seven parallel Opus exploration agents (water, boat design, boat
animation, architecture, vegetation, sky/lighting, composition/post).
Every claim below was independently verified against source before inclusion;
claims that did not survive verification are recorded in §5.

## 0. The through-line

The atmosphere pass (`52c7e12`) fixed *palette* and *depth*. What the seven
reports agree on is that the remaining gap is **value structure, grounding and
density** — and that an unusual share of it is not missing features but
**features that exist and are switched off, mis-wired, or unreachable**.

Seven of the highest-value items on this list cost zero draw calls because the
machinery is already built and already paid for.

## 1. Tier 0 — defects. Fix regardless of art direction.

| # | Defect | Evidence | Cost |
| --- | --- | --- | --- |
| T0.1 | Water shader uses **perspective-camera idioms under an orthographic camera**. `garden-water.ts:825` `normalize(cameraPosition - vWorldPosition)` and `:700` `distance(cameraPosition, vWorldPosition)`. Under ortho, rays are parallel and `cameraPosition` is a point 110u off target, so fresnel carries a spurious radial gradient and **every "aerial perspective" term is a radial vignette, not depth** — it darkens screen centre and lightens the corners, including near ones. `vFogDepth` is already a varying and is already used at `:1334`. | ortho confirmed `world-renderer.ts:860` | free (removes a `sqrt`) |
| T0.2 | **`VISUAL_INVARIANTS.md:115` states "windows glow at dusk/night". Nothing implements it.** `lighthouse-window-glow` occurs twice in the repo, both declarations, never read. The GLB generator comments "dusk/night lift is the renderer's call" — the renderer never makes it. Every building aperture is a frozen constant; the day cycle drives only beacon, mirror, statue, harbour lantern, ship lantern, sails. | `garden-day-cycle.ts:300-358` | ~20 lines, 0 draws |
| T0.3 | **`pitch` is a dead channel.** `world-renderer.ts:4683` passes `visual.root.rotation.x` to the batch; nothing ever assigns it. Resting hulls also have no roll (`heel` is turn-only), so ~2/3 of the fleet is heave-only on a rig with roll+pitch fully plumbed. | verified by grep | free |
| T0.4 | **`heel` is frame-rate dependent.** `:4502` scales a per-*frame* heading delta. At 120 Hz ships heel half as far as at 60 Hz. | — | free |
| T0.5 | **`kobaya` is a dead silhouette.** 0 of 217 live coins. A hull batch, sail batch and 320-slot buffers are allocated per startup and never drawn. `bezaisen` is 43.3%. `algo-junk` and `crypto-caravel` also have zero coins. | measured over `coins.generated.json` | free |
| T0.6 | **Hero-reflection strength normalises against a stale table.** `garden-hero-reflections.ts:160` uses `(r - 0.29)/1.21`; live reflectivity is calm 1.62 / danger 0.38, so **both ends clamp** and the mid-range is compressed. Doc comment still cites 1.5/0.42. | `garden-sea-regions.ts:256,288` | free |
| T0.7 | **Ripple rings truncate silently at 12 in Map insertion order.** Claimants (docks + islets + island + pigeonnier + ships) already exceed 12, so which rings render is non-deterministic. | `garden-water.ts:1648` | 3 lines |
| T0.8 | **Shore-distance channel is documented and written as zero.** `garden-sea-regions.ts:89` specifies `B = shore distance`; `:158` writes `0`. Meanwhile `garden-water.ts:761-795` hand-authors ~35 lines of ellipse/sine bathymetry approximating a coastline the terrain knows exactly. | — | see T3.2 |

## 2. Tier 1 — zero-cost, high impact. Recommended first commit.

All free: constants, uniforms, or terms inside the already-fused `EffectPass`.
**Total budget impact: 0 draw calls, 0 triangles, 0 textures.**

- **T1.1 Vignette rebalance.** `garden-post.ts` day `vignette 0.26→0.40`,
  `vignetteBias 0.4→0.15` (+dusk/night). The bias currently pushes darkening to
  the *top* of frame — duplicating the bokashi bands and the new fog — and
  starves the bottom, which is where every reference puts its framing darks.
  Bottom corners go 9.3% → 20.2%. Re-pin: 6 lines.
- **T1.2 Fresnel.** `garden-water.ts:848` `pow(...,3.0)` → Schlick `0.02 + 0.98·pow(1-cosθ,5.0)`,
  gain `0.16 → 0.55+0.45·daylight`, **scaled by `seaReflectivity`** (already
  computed at `:937`, currently used only for the beacon column). Makes Calm a
  mirror and Danger leaden from the field the sim already obeys.
- **T1.3 PMREM probe sharpness.** `PROBE_ROUGHNESS 0.4 → 0.21`. Both are exact
  mip breakpoints, so **both take the same single-fetch arm** — identical cost,
  sharper reflection, and the probe dome draws a real sun disc, so this yields a
  genuine specular sun in the water.
- **T1.4 Region-driven mirror zones.** Stillness currently reaches the shader
  only via one hardcoded 13×9 harbour ellipse; the region field already knows
  calm/wreck stillness. `mirror = max(harborCalm, smoothstep(1.1,1.6,regionReflect))`.
- **T1.5 Fleet motion** (T0.3/T0.4 plus): roll+pitch on the existing bob
  oscillator with incommensurate phase, `REST_RADIUS_DEFAULT 0 → 0.07`
  (calm currently has *literally zero* rest drift), two-term bob, moored sway
  period 233 s → 45 s at half radius, positional gust → bob amplitude.
  ~25 lines, 3 files, no new oscillator.
- **T1.6 Station wall colour.** `garden-docks.ts:333` — one hex `"#a99a79"` for
  all nine archetypes. Derive per-archetype from the existing roof ladder.
- **T1.7 Lighthouse rim light** `0.1 → 0.16 (+dusk/night)` and extend to the
  precinct masonry/cliff, which form the tower's base silhouette and have none.
- **T1.8 Midday fill cut.** day `ambient 0.22→0.20`, `hemi 0.5→0.42`; ratio
  4.58:1 → 5.32:1. **Hard floor: `ambient+hemi > GARDEN_ENVIRONMENT_INTENSITY (0.6)`** —
  0.62 leaves 0.02. Pin that floor with a comment. Re-pin: 0.
- **T1.9 Sail band Nyquist fix.** Junk battens land at v=0.16/0.32/0.48/0.64/0.8
  against a 6×6 grid — **three of five render as zero**, and both reef bands
  render as zero on every sail. Move to `n/6`, widen falloff to 0.08.
  24% of the fleet gets back its defining feature.
- **T1.10 Hull value spread.** `ship-age.ts:35` ±4-6% → ±6-15%. At rest, value
  is the only hull channel the eye resolves; 43% of hulls are one shape in one
  narrow value band.

## 3. Tier 2 — cheap draws, large look. Second commit.

- **T2.1 Foreground re-site (0 draws).** `garden-rim-mesh.ts:846` says it
  outright: the two silhouette masses were sited for the 1.0 rest and after the
  0.72 reopening "read as near-shore silhouettes in the lower-left quarter
  instead of bleeding past the frame edge." A framing element fully inside the
  frame frames nothing. Move them out until clipped by the edge; raise hero
  pine 15.4 → ~19.
- **T2.2 Vegetation (+3 draws, ~+30k tris).** Measured census: **41 trees in the
  entire world**; vegetation is 5 of 233 draw calls and 9k of 361k triangles —
  2% of budget for a brief that says "Japanese garden". Rim understory (1 draw,
  ~500-700 instanced domes), islet pines (1 draw — a leaning pine on a rock in
  still water is the reference shot), second broadleaf species (1 draw), then
  seasonal colour on it for free. **Use solid vertex-coloured instanced geometry,
  not alpha cards** — N8AO runs `transparencyAware=false` at half res, so cards
  occlude as solid rectangles.
- **T2.3 God-ray gate.** `GODRAY_ELEVATION_NONE 0.55 → 0.85`. Currently shafts
  are hard-off from ~08:20 to ~16:20. Only item with real GPU cost (28-step
  half-res march all day instead of ~5h); measure.
- **T2.4 Midday mist.** `garden-sky.ts:877` computes to *exactly* 0 for 8.5 h;
  the nine authored depth-layered banks contribute nothing at the modal hour.
  Add `+ daylight*0.12`. Note the test is named "keeps the banks out of the
  midday frame" — this is a design reversal, not a fix.
- **T2.5 Backdrop sun.** The visible sky is a 4-stop gradient; the dome with all
  the atmosphere, corona and ember is `visible = false` (probe-only). The sun
  blob sits at screen y 0.56 — behind the water plate. Raise it into frame and
  add a low-sun glow boost. Also push the ramp stops up so all four land in the
  visible band instead of under the sea.

## 4. Tier 3 — bigger bets, each its own pass.

- **T3.1 Sun elevation `0.806 → ~0.62 rad`. PARKED by the operator 2026-09-07**
  — kept as a potential followup, not queued. Everything else in tiers 0-3
  shipped in `6e46dce`; this is the only item outstanding, and it is parked on
  purpose rather than left undone. Pick it up only on an explicit ask.
  **T3.1 Sun elevation `0.806 → ~0.62 rad`.** The real midday fault is
  `dayCyclePhase` returning `daylight=1, dusk=0` for **8.5 straight hours**
  (h≈8→16.5) at 31-46° elevation. Lowering noon elevation lengthens every
  shadow 46% and feeds shadow frustum, fog sun direction and the water's sun
  road from one number. **But it re-keys the grade, the AO ladder and the PMREM
  probe** — ship it with a fresh grade pass, never as an isolated diff.
  Do **not** widen `ARC_SWEEP`: azimuth already sweeps 79°, and widening drives
  the sun behind the viewer under a locked camera.
- **T3.2 Shore-distance channel (T0.8).** Highest payoff / highest structural
  risk: real depth transparency, soft wet-edge dissolve at *every* shoreline,
  and caustics in every shallow rather than one circle around the island —
  while deleting ~30 lines. But the hand-authored bathymetry is art-directed
  (that basin at (34,30) is somebody's deliberate dark pool); keep the authored
  terms as a modulation on the first pass.
- **T3.3 Boat forms.** Route `chartered-brigantine → kobaya` (fixes T0.5; drops
  bezaisen 43.3% → ~24.5% and revives the only bowsprit/lateen form and the
  bright end of the timber ladder). **Must ship with a bowsprit trim** —
  kobaya's x-reach is 8.05 vs bezaisen 3.7 and 32 ships would double their berth
  footprint. Then the bezaisen stern castle (~4k tris).
- **T3.4 Hull material.** Per-vertex roughness: glossy rail and a wet waterline
  band against the matte hull. Cited as the single biggest "toy → craft" lever.
  Fragment-only, 0 draws; needs a `customProgramCacheKey` change.

## 5. Rejected / corrected

- **Planar reflection pass** — costed at ~40 duplicated draws; the water agent
  recommends against, since T1.2+T1.3+T1.4 get most of the read for zero. Agreed.
- **Widening `ARC_SWEEP`** — see T3.1. My own initial framing ("the sun barely
  moves") was **wrong**: it came from comparing `#t=7` and `#t=17`, which are
  near-symmetric about solar noon (19.4° vs 23.8°). The azimuth sweeps 79°.
  The fault is the phase plateau and elevation, not the arc.
- **Defaulting the clock to a flattering hour (17-19)** — rejected. The wall
  clock is the piece's premise; a garden that lies about the time is a
  screensaver. Art-direct midday instead (T1.8, T2.3, T2.4, T2.5, T3.1).
- **More stone lanterns / raising the Pharos / more station tiers** — each
  reverses an explicit recorded decision or carries very high re-pin cost for a
  gain other items already deliver.
- **Raising ambient-life counts** (birds, koi, fireflies) — the sortie
  choreography is well designed and correctly sized. Redistribute instead: the
  4 koi sit in one 2-tile basin nobody frames.

## 6. Overlaps between reports

- Foreground depth layer: composition (re-site existing) vs vegetation (plant
  more). **Take composition's first** — 0 draws, and the code already documents
  the masses as mis-sited.
- Atmosphere: water, sky and composition all claim midday flatness. They are
  attacking different halves — water owns the sea's value ladder (T0.1), sky
  owns the light and the gate (T2.3/T3.1), composition owns the frame (T1.1).
  Not redundant, but land them in that order and re-look between each.

## 7. Budget

Tier 0 + Tier 1: **0 draw calls, 0 triangles, 0 textures.**
Tier 2: +4-5 draw calls (→ ~238/700), ~+30k triangles (→ ~391k/500k).
Current measured: 233 calls, 361k tris, 51 textures, p95 16.8 ms, tier full.

Resolved: the `#t=12.25` **50 fps** reading did not reproduce. After the pass,
`preview --assert` measures tier full, p90 16.7 ms, p95 16.8 ms, 232 draw calls
(below the 233 baseline), 385,190 triangles, 51 textures. It was a single noisy
capture, not a regression.

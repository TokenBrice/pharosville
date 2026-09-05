# Warm village exploration — PharosVille vs. the Claudeville reference

Date: 2026-09-05. Exploration only; no code changed. Starting state: uncommitted
"garden cold pass" (`agents/2026-09-05-garden-cold-pass.md`) on flags / signs /
boat covers / congestion — orthogonal to this question.

Operator's complaint (dusk frame, 1568×1004): "cold and quick, remote, generic,
distance, uniform". Reference qualities: each object recognizable, distinct
composition, warm lively colour, natural activity.

Sources: five subagent reports — `agent://ColorLightScout`,
`agent://CompositionScaleScout`, `agent://IdentityScout`, `agent://ActivityScout`,
`agent://SotaResearch` (web state of the art). Numbers below are from constants
in source, not eyeballed.

## 1. Root causes (each complaint → mechanism)

### "Distance" — the resting camera is below every legibility threshold

- `GARDEN_DEFAULT_CAMERA_ZOOM = 0.6 × 1.02 = 0.612` (`src/systems/camera.ts:24-26`).
  Orthographic, 30° pitch. View height 102.5 wu at 1004 px.
- The world's own thresholds for "close enough to read" all sit ABOVE rest:
  AO on at `smoothstep(0.66, 0.9)`; sail marks fade below `MARK_FADE_ZOOM 0.58`
  to `MARK_MIN_PRESENCE 0.26`; `FLEET_FRAMING_RESTRAINT 0.18` full below
  `0.84`; `explore` semantic view (dock fine detail) only at zoom ≥ 1.05
  (`garden-fleet-batch.ts`, `garden-observatory-slice.ts`, `world-renderer.ts`).
- Comment blocks in `garden-fleet-batch.ts:222-253` and `garden-height-fog.ts:20-22`
  still cite a retired default of 0.7776 — the restraint stack was calibrated to
  a closer camera and never re-based when the landing moved to 0.612.
- Screen sizes at 0.612 (8.48 px per vertical wu): lighthouse 288 px, Mole
  182 px, ordinary station 61–103 px, typical hull 20–40 px. Reference
  buildings ≈ 162 px (1/6 of 972). Operator's frame shows the full diamond,
  i.e. whole-map (`minZoomForViewport` ≈ 0.30) or the arrival opening pose
  (0.502): stations 30–50 px, hulls 7–32 px, and `OVERVIEW_LOD` (< 0.44)
  has shed every prop — barest exactly when smallest.
- No near-field: at default the frame is an interior window with no plate
  edge; at whole-map a bare diamond ringed by haze. Reference frames with
  foreground fence/trees and large near buildings.

### "Uniform" — count × scale floor × identity drain × per-issuer paint

- Up to 320 hulls (`GARDEN_OVERVIEW_SHIP_LIMIT`), live ~185, vs ~14 nameable
  structures (lighthouse, 8 stations, pigeonnier, 3 islets, wreckyard) → 13–23
  hulls per landmark.
- `GARDEN_SHIP_VISUAL_SCALE_MIN 0.55` compresses most coins into one 20–40 px
  footprint where six hull families cannot be told apart.
- Hull paint is hashed per ISSUER from six near-identical browns
  (`HULL_TIMBERS` #8a6a44 #9a7448 #a87e46 #453b31 #7d7768 #6c5238, brand
  whisper 0.12, `garden-ships.ts:531`) — family shape and colour are
  uncorrelated, so the eye cannot group.
- At rest the identity channel (sail dye) is at its most anonymous: cloth
  restraint ≈ 0.53 + framing step 0.18 + marks at the 0.26 floor + depth
  aerial 0.4 (`garden-fleet-batch.ts`).
- Anchorages cluster within each band, but every band fills all its own water,
  so the union still carpets the sea at wide framing.

### "Cold / generic" — chroma is capped at the source, then compressed, then fogged brown

- `palette.test.ts:36-40` asserts OKLCH C < 0.1 for every non-reserved token.
  Everything but `vermillion` / `lantern_warm` / `lantern_glow` / `sail_red` /
  `bloodmoon_red` is grey-ish by contract. Value spread is L 0.30–0.62 for
  hulls, land, roofs, water. Reference register (grass green, ochre, teal
  canals) sits at C ≈ 0.10–0.18.
- Tone: AgX, exposure 1.12 (`world-renderer.ts:815`). AgX compresses mid
  chroma; the dusk grade restores 1.06 and the LUT 1.05 — nothing to recover.
- Dusk fog dye = `sky_horizon` lerp `lantern_warm` 0.36 ≈ **#886440 brown-grey**
  (`garden-day-cycle.ts:66`). Linear fog reaches 54–63 % at frame top
  (`FOG_NEAR 178 / FOG_FAR 300`); height fog (density 0.00062) adds 7–15 %
  of the same dye to EVERYTHING including the near half; DOF far blur on top;
  horizon ridges at 0.98/0.97/0.96 value = one flat band.
- Dusk zenith #1C2240 ≈ night zenith #0f1128: the dusk sky is a night sky
  with a 0.55 ember band.
- Dusk light: key `lantern_warm` @1.9, hemi 0.44, ambient 0.18 → key:fill
  ≈ 3:1; `MIN_KEY_ELEVATION` keeps the sun ≥ 7°, so the ember hour has no
  long shadows. Reference: warm lit faces against cool navy ground.
- Land rim: EARTH ≈ #423a2b, MOSS ≈ #44736e, PINE = sail_teal×0.68 — land
  and sea share the same cool-brown/grey-teal register; no hue contrast
  between the two big fields.

### "Quick / static" — amplitude, not RAF

- RAF is fine: idle (180 s) drops to 30 fps and keeps water/birds/flags alive;
  only reduced-motion is truly static (`render-scheduler.ts`).
- What moves at default: beam (957 px cone, the ONLY large motion); ships at
  0.45–0.8 tiles/s = 7–12 px/s, ~27 % underway; moored bob 0.3–0.8 px; birds
  3–8 px with ~25 % airborne (`SORTIE_CHANCE 0.55 × SHARE 0.45`); koi
  near-still; flame 25 px.
- Quays are states, not events, by contract (`garden-cargo-tide.ts` header:
  "a state, not an event"). No crews, carts, cranes, smoke on the ring; only
  smoke is the beacon's.
- Ephemera surface as text: almanac sighting ≤ 1/day, route pulses 4 at a
  time; no speech bubbles, no arrival flourish, no persistent nameplates.

### "Generic" — nothing is named in-frame

- Only `pharosville-hover-tooltip` (dwell-gated) + selection panel
  (`src/pharosville-world.tsx:1068`). Sea steles name waters. GLB label
  anchors exist (`garden-models.ts`, 5.8–9.6 u) but nothing renders on them.
  Reference names every building and agent always-on.

## 2. What the state of the art says (SotaResearch)

- Consensus 2024–26: composition + silhouette + value structure + district
  palette + state-driven motion FIRST; one coherent rendering treatment second;
  grade last. Matches this repo's own "no arbitrary post effects to solve
  composition" rule.
- Cheap, high-fit for a WebGL r17x pipeline at ~250 calls: `MeshToonMaterial`
  with one shared 3–4 band gradient (zero extra draws); Khronos **Neutral**
  tone mapping vs AgX for a colourful miniature; sparse `CSS2DRenderer`-style
  DOM chips; restrained half-res N8AO (already present); instancing (already
  present).
- Expensive / poor fit: inverted-hull outlines on 130 ships; Kuwahara /
  dithering / LUT stacks; WebGPU/TSL migration as a style vehicle; Tiny Glade
  GI.
- One-identity choice, not an add-on: pixel-perfect low-res ortho render with
  texel-snapped camera + depth/normal edges (Holland 2024;
  `RenderPixelatedPass`) gives the reference's crispness but must replace SMAA
  and be authored against — a direction decision, not a lever.
- Townscaper / Thronefall lessons: few large semantic units beat many small
  uniform props; rare "recipes" beat evenly distributed variety; a build/arrive
  event needs only scale + particles to read.
- "Claudeville" has no public record; closest public analogues (Pixel Agents,
  Claude Office) are Canvas 2D sprite towns — large sprites, finite named
  roles, state machines, bubbles.

## 3. Proposal — four workstreams, ordered by leverage

Each item names the contract it touches. Items marked **[contract edit]** need an
explicit `VISUAL_INVARIANTS.md` + test change in the same commit; items marked
**[operator decision]** reverse a recorded sign-off.

### A. Composition & scale (biggest lever, lowest render cost)

1. **Re-base the resting camera to zoom ≈ 0.95–1.05** (`GARDEN_FIT_CAMERA_MIN_ZOOM`
   / `GARDEN_DEFAULT_CAMERA_TIGHTEN`; keep whole-map as the explicit zoom-out).
   Stations → 95–168 px (reference 1/6), hulls 33–106 px, AO/explore/marks all
   land on the legible side of rest. `FOG_REFERENCE_VIEW_HEIGHT` tracks the
   constant automatically (as the fog-pivot contract demands). Re-author the
   four attract postcards (already deferred, `epic-harbor-plan.md:580`); arrival
   opening pose should end at the new rest, not 0.502. **[contract edit]** on the
   recorded "authored 0.60 plate composition".
2. **Re-base the fleet restraint stack to the real default** even if (1) waits:
   `FRAMING_RESTRAINT_RELEASE_ZOOM 0.84`, `MARK_FADE_ZOOM 0.58`, `MARK_MIN_PRESENCE
   0.26 → ~0.45`. Pure viewing-condition retune; satisfies "chroma never value,
   never in the cloth". Touches the 2026-08-13 "15–20 % at default zoom" pin in
   `garden-fleet-batch.test.ts:648-652` **[operator decision]**.
3. **Display thinning of hulls at wide framing** (view-height-keyed: dominant
   mooring + representatives per band below zoom X; all 320 above). Keeps 320 as
   placement/batch capacity; makes count a viewing condition like chroma already
   is. Framed against the "full eligible fleet may render up to 320" clause
   **[operator decision]**; preserves the anchorage cluster tests.
4. **Grow ordinary stations** `secondLevelTop 7.2–12.1 → ~14–18` (uniform
   vertical scale; footprints/clearances unchanged; Mole keeps ≥ 1.20× lead).
   **[contract edit]** — precedent: the 2.6× flag change made for the same
   recognition request.
5. **Raise `GARDEN_SHIP_VISUAL_SCALE_MIN 0.55 → ~0.8`** or per-family minimums so
   six silhouettes differ at rest. Edits D-S5; regenerate placement evidence.
6. **One or two camera-near foreground masses** (S/E corners: pine group, torii,
   fence line) so the plate is framed rather than floating. Displacement: the
   open-water band past the S/E limits (`GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT`).
   Dark silhouettes → night one-dominant-light untouched; helps the 16 px blur
   audit.

### B. Colour & light (turns "cold" into "warm" without new post effects)

1. **Raise the palette ceiling** OKLCH C 0.1 → ~0.14 and re-grade a named set:
   rim EARTH/PATH toward ochre, MOSS/PINE toward real green, `roof_clay`/
   `roof_thatch` up to the line, hull timbers +1 chroma step. Every material
   derives from `HARBOR_PALETTE`, so this is one contract change with the
   widest reach. Keep vermilion exclusivity. **[contract edit]** (`palette.test.ts`).
2. **Hue contrast between the two big fields**: sea toward saturated teal/indigo
   (`garden-water.ts` DAY/DUSK bands, `ZONE_THEMES`), land toward warm ochre
   (`garden-rim-mesh.ts:71-98`). Renderer-side only; no tile reclassification.
3. **Re-dye the dusk fog from brown-grey to ember and thin it**:
   `DAY_CYCLE_SKY_PRESETS.dusk.fog`, height-fog dusk density 0.00062 → ~0.00035,
   `GARDEN_HORIZON_VALUE_SCALES [0.98,0.97,0.96] → ~[0.90,0.80,0.70]` so the
   borrowed mountains read as three planes. Seam stays; only the dye changes.
4. **Dusk drama**: key 1.9 → ~2.6, hemi 0.44 → ~0.34 (key:fill 3:1 → ~6:1), lower
   dusk key elevation via `garden-sun.ts` only (single-arc rule), dusk zenith
   away from night toward navy so warm lit faces sit on a cool sky.
5. **Tone-mapper A/B: AgX vs Neutral** at exposure 1.12 on the same frame. If
   Neutral wins, it displaces AgX (one output mapping, not a stacked effect).
6. **Grade**: dusk saturation 1.06 → ~1.15, vignette 0.36 → ~0.28 (the fogged
   top is currently double-darkened), DOF strength/bias one step down at rest.
7. Optional identity move, evaluate only after 1–4: **shared `MeshToonMaterial`
   gradient (3–4 bands)** on stations/hulls/rim — zero extra draws, one texture,
   replaces the flat-shaded standard response. Named displacement: the current
   `flatShading` PBR response. Not a post effect.

### C. Recognizability (make the 14 landmarks + 6 families nameable)

1. **Always-on DOM label chips for the 8 stations + pigeonnier** (icon + chain
   name + one state word), projected from the existing GLB/station label
   anchors, lighthouse-rect exclusion, screen-space collision. Zero WebGL
   draws. Displaces hover-only naming. Satisfies "DOM labels must not cover the
   lighthouse, controls, or active detail panel". Ship chips only for selected /
   arriving / anomalous.
2. **Per-family hull paint**: six authored timber/trim pairs keyed on hull
   FAMILY (keep the 0.12 issuer whisper + strake for F1). Hull is not the
   protected cloth, so no restraint-contract conflict; adds a redundant channel
   to the world-encoding table.
3. **Per-archetype animated signature**, one each, day-first and ember-tier at
   night: uogashi steelyard sway, reed-boathouse water wheel, storm-mole lamp
   shutter, hatago lantern flicker, fishing-pier net flap, Mole bell. Each names
   its displaced oscillator (precedent: pigeonnier pigeons cap 5; waterwheel can
   take the koi basin slot).
4. **Mark legibility**: `IDENTITY_LOGO_SPAN 0.78 → ~0.9`; optional 128 → 192 px
   sail cells (3072 atlas, still one texture under the 72 ceiling).
5. **Edge hold without a post pass**: in-geometry edge band in the vertex-colour
   bake / creased-normal corner darkening on stations. Lowest priority; only if
   A+B leave silhouettes mushy.

### D. Life (activity that reads at rest)

1. **Arrival/departure beats**: the paired 15 s windows already schedule ~32/40
   events; give each a 3–6 s flourish — sail furl/unfurl, bow-wave stamp via the
   existing wake field, one gull lift at the berth, a 3 s nameplate dwell via
   `createHoverNameplateDwellState`. Reuses existing oscillators (wake decay
   8 s, ripple), decays to exact static → passes reduced-motion gates; no new
   draws. Demotes the beam's monopoly on large motion.
2. **Bird amplitude, not count**: `SORTIE_SHARE 0.45 → 0.6`, loop radii 3.5 → ~6 u
   so flight reads at rest; keep chance 0.55 and phase offsets (W3.4).
3. **Station chimney smoke** on 2–3 archetypes reusing the beacon smoke material
   (instanced, unlit, +1 draw, tier-shed). Displaces the plume's uniqueness;
   touches neither the 16-lane ember budget nor one-dominant-light.
4. **Quay crew loops** (lighter rowing out, crate hand-off, crane lift) tied to
   `dockVisits` / `cargoTide.pressureScore` so they are data-bearing, registered
   in `OVERVIEW_LOD_DETAIL_NAMES`. **[contract edit]** — contradicts the cargo
   tide's "state, not event" rationale and needs a displacement name.
5. **Surface ephemera in-world**: mirror almanac sightings and route pulses as a
   transient DOM chip near their anchor (the reference's speech bubbles), with
   the ledger row as parity.

## 4. Operator decisions (2026-09-05) — plan is execution-ready

| Item | Decision |
| --- | --- |
| Palette ceiling | Raise `palette.test.ts` OKLCH C < 0.1 → ~0.14; re-grade land, roofs, hulls. Vermilion stays exclusive. |
| Default camera | Rest zoom ≈ 1.0 (stations ≈ 1/6 frame). Whole-map remains the explicit zoom-out. Re-author attract postcards; arrival eases to the new rest. |
| Hull count | Display thinning below zoom ~0.7, progressive to dominant moorings + representatives at whole-map. 320 stays placement/batch capacity; amend the "320 may render" clause to a viewing condition. |
| Hull scale floor | `GARDEN_SHIP_VISUAL_SCALE_MIN 0.55 → ~0.8`; regenerate placement evidence. |
| Station scale | `secondLevelTop` 7.2–12.1 → ~14–18 u, uniform vertical scale, footprints unchanged, Mole ≥ 1.20× lead. Contract + `chain-docks.test.ts` edit. |
| Labels | Always-on DOM chips for the 8 stations + pigeonnier at every zoom; ship chips only on select / arrival beat / anomaly. Lighthouse-rect exclusion, collision. |
| Look | Keep painterly-soft; evaluate a shared toon-band gradient only after A–C land. No pixel-crisp cutover. |
| Tone mapper | A/B Neutral vs AgX inside the resting-frame commit using `npm run preview`; pick by frame, land one. |
| Sail restraint | Reverse the 2026-08-13 pin: re-base thresholds to the 1.0 default, lower `FLEET_FRAMING_RESTRAINT` to ~0.10. Depth term unchanged. |
| Quay life | Not yet. D1–D3 only (arrival beats, bird amplitude, station smoke). D4/D5 deferred. |
| Foreground | 1–2 dark silhouette masses at the S/E corners; displaces `GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT` open-water band. |
| Delivery | No throwaway A/B. Four sequenced commits. |
| Evidence per commit | `npm run preview` frames at day/dusk/night + whole-map, focused unit tests, `npm run validate:changed`; `validate:release` once at the end. |
| Worktree | **Wait for operator's go.** Current dirty worktree (garden cold pass) is being pushed by the operator; start only after that lands, on top of it. |

## 5. Execution sequence

1. **Resting frame** — A1 camera 1.0 (+ postcards, arrival), A2 restraint re-base
   to ~0.10, A3 thinning below 0.7, B3 ember dusk fog + density 0.00035 +
   horizon `[0.90,0.80,0.70]`, B4 dusk key 2.6 / hemi 0.34 / navy dusk zenith,
   B5 Neutral-vs-AgX pick, B6 grade (sat 1.15, vignette 0.28, DOF one step).
   Contract edits: composition (0.60 plate → 1.0 rest), 320 clause, restraint
   pin test, fog pivot verified tracking.
2. **Palette** — B1 ceiling 0.14 + named re-grade, B2 warm land / cool sea hue
   split. Re-run palette suite, quiet-field audit, blur audit.
3. **Recognizability** — C1 station chips, C2 per-family hull paint, A4 station
   scale 14–18 u, A5 scale floor 0.8, C4 emblem span 0.9, A6 foreground masses.
4. **Life** — D1 arrival/departure flourishes on the paired windows, D2 sortie
   share 0.6 / radii ~6 u, D3 station smoke on 2–3 archetypes. Then
   `validate:release`, and the toon-band evaluation as a separate decision.

## 6. Explicitly not recommended

- Stacking outline + LUT + dither + Kuwahara post passes; inverted-hull
  outlines on the fleet; WebGPU/TSL migration for style; dozens of point
  lights; universal looping bob as "life"; a second renderer or fallback.

## 7. Outcome (2026-09-05) — implemented on local `main`

Commits `f55afbc` (phase 1), `70a970b` (phase 2), `4c41637` (phase 3),
`7d1a2a9` (anomaly nameplates). Evidence frames: `outputs/wv2-*.png`
(phase 1 day/dusk/night/whole-map), `outputs/wv3-*.png` (phase 2 incl.
whole-map chips), `outputs/wv6-day.png` (phase 3 after the sail fixes). Live
rest frame: 213 recurring calls, ~335k tris, 50 textures, 60 fps p95 16.8 ms
on the reference GPU. `npm run validate:changed` green after every phase;
`validate:release` recorded below.

Deviations from the plan, all decided during execution:
- Tone mapper: Neutral chosen over AgX from the dusk/day/night frames (AgX read
  flatter/greyer at dusk; Neutral keeps the ember and the teal).
- Fog ladder: instead of moving FOG_NEAR/FAR, `FOG_MIN_SCALE` 1 → 1.21 so the
  ladder starts ~70 % up the frame at rest and every wider framing is
  byte-identical to before.
- Dusk ambient 0.18 → 0.28 (not unchanged) so hemi+ambient stays above the
  0.6 PMREM probe; key:fill lands at ~4.2:1.
- Station band 13.3–17.9 u, not 14–18: the clone-separation contract
  (no two archetypes within 10 % on both area and height) plus the Mole's
  1.20× lead cap the floor at 13.45.
- Sail furl is a transient 1.0 → 0.6 → 1.0 dip; the first cut held sails
  furled while moored, which erased the identity channel and was reversed.
- Station chips are on at every zoom (the first cut's 0.5–1.8 band was
  removed: whole-map is where all nine stations share the frame).
- Live fix outside the plan: a dock berth may no longer coincide with a
  ship's risk anchorage (zero-length voyage crash on the live payload).

### Release-note draft (unversioned — lift into the release PR)

Title: Warm Village. Summary: a closer, warmer harbor where every station is
named, every hull family is recognizable, and arrivals are visible events.
Collected from commits `f55afbc` through `7d1a2a9` after v0.13.0.

- Moved the resting camera in from a distant plate view to a sailed-in
  composition (zoom 1.0, never below 0.8), re-authored the idle postcards as
  close framings, and let the arrival move ease into the new rest. Whole-map
  remains one zoom-out away, and the hull count now thins toward each water's
  main anchorage as you pull back so the wide view reads as a harbor rather
  than a carpet.
- Warmed the world at the source: the palette's chroma ceiling rose so land
  reads ochre and green against a more saturated teal-to-indigo sea, dusk is
  an ember hour with a raking key light and a navy zenith instead of a
  brown-grey wash, the horizon steps through three ridge planes, and Neutral
  tone mapping keeps those colors. The fog ladder now starts in the frame's
  upper third at rest.
- Named the harbor: every chain station and the TON pigeonnier carries an
  always-on chip with its logo, name, and concentration state at every zoom,
  hiding rather than covering the lighthouse, controls, or an open record.
  Ships get a chip while selected, during an arrival or departure, or while
  failing the DEX cross-check or lying in Danger water.
- Made each of the six hull families its own color on a value-and-hue ladder
  while sails keep issuer identity, enlarged sail emblems, raised the smallest
  hulls off a 0.55 floor to 0.8, grew ordinary station halls to 13.3–17.9
  units, and framed the near corner with a pine group and a dark torii and
  fence.
- Gave the fleet readable beats: on arrival and departure a ship dips and
  resets its sails, throws a bow or stern wave into the wake field, and shows
  a brief nameplate, capped at six at once; moored sails otherwise stay fully
  set. Birds fly wider and more often, and three hearth stations smoke while
  their cargo tide runs — unlit, so the beacon stays the night's one light.
- Fixed a live-data crash when a small coin's berth coincided with its
  anchorage, and kept every batched sail within the GPU's vertex-attribute
  limit.

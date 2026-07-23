# PharosVille Three.js Visual Revamp: The Lantern Sea

Date: 2026-07-24

Status: Proposed — awaiting operator review

Companions:
[`2026-07-23-threejs-implementation-plan.md`](./2026-07-23-threejs-implementation-plan.md)
(this plan expands the visual scope of Phase 4 tasks P4.1–P4.5),
[`2026-07-23-threejs-pharosville-assessment.md`](./2026-07-23-threejs-pharosville-assessment.md).

## Objective

Take the working Three.js Garden Observatory from "clean low-poly slice" to a
scene that is beautiful, poetic, and calm — a Japanese garden at night, with
boats, on the sea. Fidelity to the previous Canvas PharosVille is explicitly
**not** a goal. Conceptual fidelity is: boats are stablecoins, the sea is the
market, the lighthouse is fleet health.

Target qualities, in the operator's words:

- The lighthouse must look epic.
- The sea must be fabulous.
- The ships must be legendary — especially titans and uniques.
- Harbors need distinct visual character.

## The Core Diagnosis

Comparing the current renderer to the approved reference mood:

1. **The gap is mostly light, not geometry.** The reference is a *night* scene
   where darkness gives every warm light meaning. The current renderer has no
   post-processing (no bloom), a daytime-teal default, and flat uniform
   lighting. Emissive lanterns exist but cannot glow without a bloom pass.
2. **The repo already agrees on the palette.** `HARBOR_PALETTE`
   (`src/systems/palette.ts`) is deep indigo seas, lantern gold, moonlight —
   but the Three renderer's own `GARDEN_COLORS` / `DAY_SKY` / water colors
   diverged into bright teal. The target look is already encoded in the
   repository's canonical tokens; the renderer must return to them.
3. **Orthographic cameras change the physics.** The view vector is constant
   across the frame, so fresnel, specular moon-roads, and screen-space god
   rays do not emerge naturally. Every reflection and glow must be *authored*:
   analytic light lanes, thresholded glitter, authored moon band, cone-mesh
   beams. The existing single beacon lane in `garden-water.ts` is the correct
   paradigm — the work is scaling and enriching it.
4. **The material read is plastic** because hulls, stone, and timber are flat
   single-color `MeshStandardMaterial`s. Vertex-color gradients and baked
   vertex AO are the cheapest fix and read instantly at 40–120 px.
5. **The GLB hero pipeline already exists** (`src/three/garden-models.ts`:
   manifest, budgets, sha256, anchors, deterministic generator scripts, one
   shipped lighthouse shell). It scales cleanly to titans, heritage hulls, and
   harbor signature props.

## Art Direction: "The Lantern Sea"

One binding look statement for every workstream:

> A deep indigo sea at the edge of night. Stone, timber, and bronze catch the
> last cool light; every warm flame — beacon, ship lantern, harbor lamp —
> blooms softly and lays a trembling golden lane on the water. Nothing hurries.
> Space is left empty on purpose.

### Principles

- **Darkness gives light meaning.** The scene's default state leans dusk/night.
  Day exists but is a soft, desaturated overcast-morning look, never the
  current saturated teal noon.
- **Ma (negative space).** Preserved from the Garden Observatory concept: open
  water is composition, not emptiness. No new clutter to "fill" the sea.
- **Wabi-sabi materials.** Weathered stone gradients, dark waterlines on
  hulls, oxidized copper — authored imperfection via vertex color, not noise
  textures.
- **Calm is slow, not still.** Long-period swell, slow beam sweep, lantern
  sway measured in seconds. Titans move *slower* than small ships.
- **Light is analytical only where it always was.** Bloom, lanes, and grading
  are decorative; zone color, labels, and DOM truth keep carrying meaning
  (visual invariant: no post pass may be required for data legibility).

### Palette contract

Retire the renderer-local teal constants and derive scene colors from
`HARBOR_PALETTE`: `deep_sea_1/2`, `shallow_teal(_lit)`, `sky_night`,
`sky_horizon`, `fog_blue/pale`, `moonlight`, `lantern_warm/glow`, stone and
timber ramps. Day/dusk/night become three authored grade+palette presets
lerped by the existing `wallClockHour` cycle (`updateDayCycle`,
`world-renderer.ts:2515`), with night as the hero state.

### Time-of-day identity

| State | Character |
| --- | --- |
| Night (hero) | Deep indigo sea, star field, moon + moon-road, every lantern blooming, beam fully volumetric |
| Dusk | Ember horizon, warm/cool split, lanterns just lit — the transition worth watching |
| Day | Pale overcast-pearl light, desaturated sea, lanterns off, mist; calm rather than cheerful |

**Decision D1 (approved):** the default presentation biases toward dusk/night;
daytime hours clamp to the pearl-overcast mood rather than following the
visitor's wall clock into a bright noon. All three states are still built.

---

## Workstream A: Light, Post, and Sky (the foundation)

Everything else reads through this pipe; it lands first.

- [ ] **A1. Post stack.** EffectComposer chain: `RenderPass →
  UnrealBloomPass (thresholded) → combined vignette+grade ShaderPass →
  OutputPass`, using three's own addons (~15–20 KiB gzip vs ~35–55 for pmndrs
  `postprocessing`). WebGL2 multisampled render target (`samples: 4`) to keep
  AA. Budget: ~2.5–4.5 ms at 1440×1000 on the reference iGPU; halve bloom's
  internal resolution if needed. Upgrade path to pmndrs bloom only if the
  beacon bloom looks crunchy on review.
- [ ] **A2. Selective bloom via threshold + emissive discipline.** Threshold
  ≈0.9–1.0, strength 0.4–0.7, radius 0.3–0.5. Warm sources (beacon, lanterns,
  windows) get emissive intensity >1 with `toneMapped = false`; everything
  else stays below threshold. No layer-based double render.
- [ ] **A3. Tone mapping: AgX** (replaces ACES), exposure ~0.8–1.1. AgX rolls
  warm highlights off without hue-skewing to yellow and degrades to black
  gracefully. Pair with the grade pass (A4) to re-saturate and lift navy out
  of pure black. Audit custom ShaderMaterials (water, beam) for correct
  single tonemapping (`tonemapping_fragment` include vs `toneMapped=false`
  additive).
- [ ] **A4. Color grade.** In-shader lift/gamma/gain + split-tone (cool
  shadows, warm highlights) folded into the vignette pass; three authored
  uniform presets (day/dusk/night) lerped by the day cycle. No LUT asset.
- [ ] **A5. Sky.** Replace flat `scene.background` with a vertical gradient
  (indigo zenith → warmer horizon), star `Points` layer (one draw call,
  subtle twinkle, motion-gated), and a moon disc + halo sprite that doubles
  as a bloom source and anchors the sea's moon-road azimuth. Retune fog color
  to the horizon mid-tone (move to `FogExp2` if linear banding shows).
- [ ] **A6. Light rig retune.** Keep exactly: 1 hemisphere + 1 ambient + 1
  directional (only shadow candidate) + 1 beacon PointLight. Night rig drops
  ambient/hemisphere far lower than today so emissives carry the scene.
  Single 1024 (512 in balanced) PCFSoft shadow map with a tight ortho
  shadow frustum on the island (D3 approved; lands in V3, subject to the
  p90 gate; off in recovery/constrained).

Exit gate: night screenshot where beacon and a ship lantern visibly bloom,
navy sea is not crushed, day scene no longer washed; p90 frame budget still
met on reference hardware.

---

## Workstream B: The Sea

Extends `src/three/garden-water.ts` (keep the single-plane, single-material
architecture).

- [ ] **B1. Dual-scrolling normal maps.** Two samples of one tiling normal
  texture at different scale/speed/rotation, blended; normal detail — not
  vertex displacement — is what catches light at iso zoom. Add
  smoothness-by-distance to kill far-zoom shimmer. This is the single biggest
  "fabulous sea" lever. (One small KTX2/PNG texture asset; keep sum-of-sines
  vertex swell for silhouette only — rounded waves fit the calm-pond mood
  better than Gerstner crests.)
- [ ] **B2. Authored glitter + moon road.** Compute a specular-ish term from
  the blended normal, **threshold to sparse extreme sparkles** (pairs with
  bloom), jitter with a 2-octave FBM; multiply by an authored world-space
  moon band aligned to the A5 moon azimuth. Under ortho this *is* the moon
  road.
- [ ] **B3. Light lanes at scale.** Generalize the existing beacon lane to N
  warm lights (ship lanterns, dock lamps, pigeonnier, cemetery lantern): pack
  (position, color, intensity) into a small `DataTexture`, fixed-max loop
  with per-fragment range culling. Static harbor lamps can be pre-baked.
  Tier-cull to the nearest ~12 lanes in balanced, ~4 in constrained. This is
  the signature "lantern sea" effect.
- [ ] **B4. Shore interaction.** Upgrade the analytic shore field: deep→
  shallow ramp plus procedural lapping foam bands
  (`sin(shoreDist·k − t)` clamped, noise-distorted), replacing the current
  single foam ring. Extend the SDF to the cemetery islet and pigeonnier so
  they sit *in* the water, not on it.
- [ ] **B5. Wake system.** Phase 1: instanced fading quad trails per moving
  ship (no RT), replacing the static wake triangle. Phase 2 (full tier only):
  offscreen 512–1024 single-channel "disturbance" render target stamped by
  moving ships, sampled by the sea shader for distortion + foam — scales to
  the whole fleet for one small extra pass.
- [ ] **B6. Sea-state expressiveness.** Map existing `seaState.swell/tempo`
  onto normal-map scroll speed, glitter density, and lane tremble so market
  agitation reads in the water itself while staying within the calm register.

Exit gate: night sea shows moon road + at least 8 simultaneous lantern lanes;
day sea reads pearl-calm, not teal-flat; recovery tier still ≥45 FPS.

---

## Workstream C: Lighthouse and Island (epic, not bigger)

- [ ] **C1. Lighthouse GLB v2.** Iterate `generate-garden-lighthouse.mjs`
  within the manifest budget discipline: stronger silhouette (broader stepped
  base rooted in rock, more pronounced gallery + corbels, taller lantern
  room), vertex-color stone gradient (dark wet base → pale weathered top),
  window reveals. Raise the manifest budgets only with measured cause.
- [ ] **C2. Volumetric beam.** Replace the flat additive plane with an open
  additive cone (no cap), soft fresnel-ish edge falloff, `depthWrite:false`
  — stable and clean under ortho as it sweeps the dark sea. Faint instanced
  dust motes inside the cone at full tier. Keep the water beam lane synced
  (`setBeaconState`). Recovery tier falls back to the current plane;
  constrained freezes the sweep. Avoid screen-space god rays entirely (they
  don't work under ortho).
- [ ] **C3. Beacon presence.** Beacon emissive becomes the strongest bloom
  source in the scene; PSI stress keeps modulating intensity/pulse as today
  (`updateDayCycle`, `world-renderer.ts:2534`).
- [ ] **C4. Island rockwork.** Replace/augment the smooth terrace cylinders
  with clustered displaced icosahedra (simplex-displaced, flat-shaded,
  flattened base, height-gradient vertex color: dark wet stone at waterline →
  pale top). Scattered boulder InstancedMesh at the shoreline. Same treatment
  for the cemetery islet.
- [ ] **C5. Island dressing.** Wind-pine upgrades (the two existing pines get
  proper layered silhouettes), stone-lantern path lighting joining the B3
  lane system, warmer cottage/pavilion windows at night, subtle ground AO
  via vertex color on terraces.

Exit gate: the lighthouse at night is unambiguously the hero of a screenshot
shown cold to the operator; island reads as stone, not extruded cylinders.

---

## Workstream D: Ships (legendary fleet)

Order matters: materials first (all ships benefit), then silhouettes, then
heroes. Extends `createShip` (`world-renderer.ts:1864`) and the cached
geometry system.

- [ ] **D1. Hull material pass (highest ROI).** Vertex-color gradients on
  every hull: dark waterline band → mid flank → warm gunwale highlight; baked
  vertex AO in cavities and under decks; authored warm-shadow/cool-highlight
  ramp. Kills the plastic read for an afternoon of work, free at every tier.
- [ ] **D2. Silhouette language.** Curved sheer line (deck rises at bow and
  stern) and per-family prow/stern identity: galleon = tall stern castle,
  clipper = sharp raked bow, schooner = low and sleek, junk = blunt high
  transom + battened sails. Contrasting gunwale trim strip. Polys go to the
  outline — that is all that is legible at 40–120 px.
- [ ] **D3. Lanterns.** The signature: 1 lantern (standard), 2 bow+stern
  (heritage), a hanging lantern string (titans). Each = tiny emissive core
  (blooms) + instanced additive glow sprite; every lantern registers a B3
  water lane subject to the tier cap. Slow pendulum sway as the primary idle
  animation (frozen under reduced motion).
- [ ] **D4. Sails.** Keep canvas identity textures (they're good); add
  stronger billow, warm translucent backlight at night (small
  `onBeforeCompile` fresnel — the one place ortho fresnel earns its keep),
  and lantern-lit sail undersides via emissive tint. Tattered notched sails
  for derelict/cemetery contexts; crisp for titans.
- [ ] **D5. Rigging.** Batch all standard-fleet rigging into one
  `LineSegments` draw; titans/heritage may use fat lines (`LineSegments2`)
  batched into a single geometry for real width.
- [ ] **D6. Titan & unique heroes (GLB).** Extend the garden-models manifest
  with titan and heritage hull models (~2–8k tris each, vertex-colored, no
  or shared trim texture, waterline origin, `+Z` forward, anchors for
  lantern points / label / selection). Monumental-yet-calm through: scale,
  broader beam, multi-sail plans, figurehead/emblem, banner flag with vertex
  wave, longer-period bob, multi-lane water reflections. Uniques (e.g. the
  bluechip shield holders) get one distinguishing prop each rather than more
  glow.
- [ ] **D7. Motion hierarchy.** Bob amplitude/period scaled by size tier —
  titans sway slowest; departing/arriving ships get gentle heel into turns.

Exit gate: a titan, a heritage hull, and a standard ship screenshot at night
are each identifiable at a glance and none reads as a toy; draw calls within
budget (instanced sprites/rigging keep the count flat).

---

## Workstream E: Harbors, Zones, and Districts

- [ ] **E1. Harbor character kit.** One modular prop kit (post, plank, lamp,
  crate, net rack, moored dinghy, derrick/crane, banner arch), instanced per
  prop-kind across all harbors. Identity per harbor = palette accent +
  arrangement/density + ONE signature prop (e.g. Ethereum grand banner arch,
  industrial crane, fishing net-racks…). Docks keep their data-driven size
  (`log10 totalUsd`) and health signal.
- [ ] **E2. Dock lighting.** Lamp rows along piers joining the B3 lane
  system; warm storehouse windows at night.
- [ ] **E3. Risk zone redesign.** Replace the filled translucent discs with
  the reference's calmer language: a dashed/broken perimeter line (the
  existing broken-ring generator is close), instanced marker buoys with
  band-colored lights (warning = amber, danger = ember-red) that bloom at
  night, and an in-water tint fed through water-shader zone uniforms instead
  of a decal disc. Preserves analytical meaning (band color + DOM label +
  buoy redundancy) while removing the "sticker on the sea" read.
  **Decision D2 (approved):** the redesign is authorized; land it together
  with the matching `VISUAL_INVARIANTS.md` and test updates.
- [ ] **E4. Danger weather.** Upgrade the rain-curtain LineSegments to a
  localized squall: darker water patch (zone uniform), denser rain streaks,
  occasional soft lightning flicker at full tier only (motion-gated, no
  strobe — accessibility).
- [ ] **E5. Cemetery & pigeonnier mood.** Cold moonlight grading, one warm
  memorial lantern lane, C4 rockwork, tattered banner. Pigeonnier gets its
  dispatch signal lamp into the lane system.

Exit gate: all 8 harbors distinguishable in one overview screenshot; a danger
zone reads dangerous at night without the filled disc; semantics tests pass.

---

## Workstream F: Ambient Life (restraint)

- [ ] **F1.** Keep gulls; still them at night (roosting on posts) in favor of
  moths/fireflies near lanterns (a dozen instanced sprites, full tier only).
- [ ] **F2.** Low drifting mist band at dawn/dusk (one large soft additive
  plane, slow scroll).
- [ ] **F3.** Nothing else. Ma. Every ambient addition needs a subtraction
  candidate.

---

## Guardrails

### Semantics & accessibility (unchanged contracts)

- Zone band, ship state, dock health keep non-color redundancy (buoys,
  labels, DOM); bloom/grading never carries exclusive meaning.
- DOM detail panel, ledger, keyboard targets, announcements untouched.
- Reduced motion: post stack stays (static bloom/grade are fine), but beam
  sweep, glitter animation, lantern sway, wakes, star twinkle, dust, mist
  scroll all freeze; water normals hold one static high-detail frame.
  Zero continuous RAF, render-on-demand as today.
- Desktop gate: all new textures/GLBs load only behind the gate.
- GPU failure path (`WorldStaticOverview`) unchanged; composer resources join
  `disposeThreeObjectTree` discipline.

### Performance ladder (per tier)

| Tier | Post | Sea | Lights/beam | Detail |
| --- | --- | --- | --- | --- |
| Full | Bloom full-res + grade + vignette | Dual normals, FBM×2, all lanes, disturbance RT | Cone beam + dust, shadows 1024 | All props, mist, fireflies |
| Balanced | Bloom half-res + grade | Dual normals, ~12 nearest lanes, quad wakes | Cone beam, shadows 512/off | Fine detail per semantic zoom (as today) |
| Recovery | Bloom off, grade only | Single normal, baked lanes, no wakes | Flat beam plane, no shadows | Decoration trimmed |
| Constrained | No composer (direct render) | Single normal, moon road + 4 lanes | Static beam | Current constrained set |

Budgets stay as approved: p90 ≤ 20 ms at 1440×1000 on the reference machine,
≤150 draw calls default aim, renderer chunk ≤ 740 KiB raw / 200 KiB gzip
(A1's ~15–20 KiB gzip fits), per-model budgets via the garden-models
manifest. Measure before and after each workstream lands.

### Verification loop

- Playwright specs are assertion-based (no pixel baselines):
  `installWallClockOverride(page, hour)` drives day/dusk/night; add debug
  fields for composer-enabled, lane count, and tier so specs can assert the
  ladder.
- Each workstream ends with a screenshot triptych (day/dusk/night at the
  standard framing) into `outputs/` for operator review — the operator is the
  product tester.
- `npm run validate:changed` while iterating; `npm run validate:release`
  before any release claim. No push without explicit operator instruction.

## Sequencing

Dependency-ordered; each phase is independently shippable and reviewed:

1. **V0 — Contracts & module extraction** (see Orchestration Playbook).
   Freeze shared interfaces and split `world-renderer.ts` into owned modules
   so later phases can fan out without file contention.
2. **V1 — Light & sky foundation** (A1–A6, palette contract). Biggest visible
   jump; everything downstream reads through it. Mostly serial (one pipeline).
3. **V2 — The sea** (B1–B4, B6; B5 phase 1). Depends on A (bloom for
   glitter/lanes, AgX for navy).
4. **V3 — Lighthouse & island** (C1–C5, D3 shadows). Beam + lane sync
   depends on A+B. C1/C2/C4 are parallelizable packets.
5. **V4 — Fleet** (D1–D5, D7). Lantern lanes depend on B3. D1/D2 serial
   (same geometry), then D3–D5 parallel.
6. **V5 — Heroes & harbors** (D6, E1–E5). Widest fan-out: each titan/heritage
   GLB and each harbor kit packet is independent.
7. **V6 — Ambient & polish** (F, B5 phase 2, tier tuning, final measurement
   sweep).

Coordination note: Codex is still completing Phase 4 parity work in the same
files (`world-renderer.ts`, garden modules). V0 should start only after the
current Phase 4 change lands, and workstreams should be rebased on its final
file layout rather than assumed line numbers.

## Orchestration Playbook

This plan is executed by an orchestrator session dispatching Opus subagents.
The rules below are binding for that execution.

### V0: contracts before fan-out

Fan-out without shared contracts produces incompatible inventions. Before any
parallel work, the orchestrator lands (or delegates to ONE agent) the
following, reviewed as a single change:

- [ ] **V0.1 Module extraction.** Split `world-renderer.ts` so each later
  packet owns whole files. Target layout (adjust to Codex's final Phase 4
  shape): `garden-post.ts` (composer/bloom/grade), `garden-sky.ts`
  (background/stars/moon/fog), `garden-day-cycle.ts` (palette presets +
  blending), `garden-island.ts`, `garden-lighthouse.ts` (procedural shell +
  beam), `garden-ships.ts` (+ existing sail texture), `garden-lanterns.ts`
  (glow sprites + lane registration), `garden-docks.ts`, `garden-zones.ts`,
  `garden-ambient.ts`. `world-renderer.ts` shrinks to scene assembly,
  frame update dispatch, picking, and disposal. Pure mechanical move —
  no visual change; all tests green before and after.
- [ ] **V0.2 Light-lane contract.** One interface in a dedicated module: a
  lane registry (`register/update/remove(id, worldX, worldZ, color,
  intensity, kind)`) backed by the B3 DataTexture, with a per-tier cap
  policy owned by the registry, not by callers. Consumers (beacon, ships,
  docks, cemetery, pigeonnier, buoys) only call the registry.
- [ ] **V0.3 Palette + grade contract.** Day/dusk/night preset objects
  derived from `HARBOR_PALETTE`, exported from `garden-day-cycle.ts`; no
  module declares its own hex literals (extend the existing palette guard to
  `src/three/**` if practical).
- [ ] **V0.4 Debug/verify contract.** Extend `__pharosVilleDebug` with:
  `composerEnabled`, `activeLaneCount`, `postPassList`, `shadowMapSize`.
  Add an `outputs/` triptych helper script (Playwright: wall-clock override
  to 11:00 / 18:30 / 23:00 at the standard framing) that every packet reuses
  for evidence.

### Task packets

Every delegated task is a packet with exactly these fields, and a packet
never edits files outside its ownership list:

```text
Packet: <workstream item, e.g. B2 glitter+moon-road>
Owns:   <files this agent may create/edit>
Reads:  <contracts + reference files, read-only>
Spec:   <the workstream bullet, plus acceptance thresholds>
Verify: npm run validate:changed (or named smaller check)
        + triptych into outputs/<packet>/ + debug-field assertions
Report: under 200 words — status, measurements (p90, draw calls,
        bundle delta), evidence paths, deviations. No file dumps.
```

Orchestrator rules:

- **Single-writer integration.** `world-renderer.ts` (post-V0 assembly file)
  and shared contract modules are edited only by the orchestrator or one
  designated integration agent per phase — never by parallel packets.
- **Serial vs parallel is marked in Sequencing** and honored: contracts and
  same-file work serial; distinct-module packets fan out. Hero-asset packets
  (each titan GLB, each harbor kit) are the widest safe fan-out.
- **Verification is the agent's job; judgment is the orchestrator's.** Agents
  run their Verify block and return measurements; the orchestrator reviews
  the triptych images directly (screenshots, not prose) and accepts or
  bounces the packet. Phase exit gates from this plan remain
  orchestrator-reviewed with the operator.
- **Model economy.** Opus for shader/visual-judgment packets; mechanical
  packets (module extraction, prop scatter tables, test plumbing) may run on
  cheaper models. Every prompt carries the report cap. Large fan-outs (V5)
  get an explicit token budget and resume cached runs rather than
  re-dispatching.
- **Measurement discipline.** Each packet reports draw-call and frame deltas
  from `__pharosVilleDebug`; the orchestrator keeps a running budget table
  per phase so the p90 ≤ 20 ms and ≤150 draw-call gates fail loudly at the
  packet that spent them.
- **No push.** Commits stay local; pushing and release remain operator-gated
  per the Phase 4 plan.

## Operator Decisions

Recorded 2026-07-24 after operator review.

| ID | Decision | Status |
| --- | --- | --- |
| D1 | Default time-of-day biases toward dusk/night (daytime clamps to the pearl-overcast look, never bright teal noon) | **Approved** |
| D2 | Risk-zone redesign: dashed perimeter + lit marker buoys + in-water tint replace the filled translucent discs; update `VISUAL_INVARIANTS.md` and tests with it | **Approved** — "the current makes little sense in this new environment" |
| D3 | Real-time shadows from the one directional light (an extra ~1–2 ms render pass so lighthouse/trees cast shadows on the island; visible mostly by day) | **Approved** — implement in V3 with a tight island-only shadow frustum; the perf ladder still drops shadows in recovery/constrained tiers, and it ships only if the reference machine stays within the p90 ≤ 20 ms gate |
| D4 | May upgrade bloom to pmndrs `postprocessing` if UnrealBloom quality disappoints on V1 screenshots | **Approved** (conditional on V1 review) |

## Research Provenance

Distilled from three parallel research passes (2026-07-24): stylized-water
techniques (dual normal maps, analytic ortho reflections, DataTexture light
lanes, disturbance-RT wakes, AgX-at-night), post/lighting stack (composer
sizing, selective bloom via threshold, ortho volumetrics, light-count
policy), and low-poly craft (vertex-color AO, silhouette language, kit-based
harbor identity, GLB thresholds, BatchedMesh vs InstancedMesh). Primary
sources include the three.js manual/docs, three.js forum perf threads,
Cyanilux/Alisavakis/Roystan stylized-water writeups, and pmndrs
postprocessing documentation.

# 05 — Pharos (hero landmark) & Night

Vertical 05 of the prettier sweep. Baseline `main` @ v1.2.1. Captures (real GPU, `npm run preview`):
`shots/05-heart-night.png` (t=21), `shots/05-heart-unlit.png` (t=21, `psi=none`),
`shots/05-heart-dusk-tremor.png` (t=19.5, `psi=TREMOR&psiScore=55`), `shots/05-heart-dawn.png` (t=5.5, `psiScore=98`).
(`view=heart` gave the same framing as the overview at 1600×1000.)

## 1. Current state

- **The beam is already a good volumetric shaft.** `beam/beam-system.ts` runs a depth-aware post effect (18 samples per ray,
  core + sheath profile, world-space mist breakup with three noise taps, an optical-depth cap, near-camera fade). It stops
  on scene depth, so it ends on the hills and the town. Heat shimmer over the lantern and a four-point mirror glint already
  exist, and so does a caution lamp by day (`setDayPresence`, TREMOR+).
- **The fire is rich.** `beam/fire.ts` has 16 crossed flame cards, 160 embers (brazier sparks plus a vent column), a glow
  halo, a 30-puff plume lit from below at night, and one flickering PointLight. `world/lighthouse-system.ts` adds a statue
  uplight on the viewer's side and an emissive bronze mirror that flashes once per revolution.
- **The PSI binding is exact and well layered** (`readings/bind.ts`, `readings-system.ts`, `model/readings.ts`):
  band → period (`PSI_SWEEP_DURATION` 12 → 1.2 s), score → reach (`reachForScore`, eased ^2.2), band → 3-step lamp colour,
  unknown → unlit (eased over `LIT_SEC`). Panel and facts carry score, band and the 24 h average.
- **The beam lights almost nothing.** Only the ocean (`ocean-material.ts` sweeping glint) and rain (`weather/precip.ts`)
  read `BeamUniforms`. The sails, hulls, quays, walls and hills it sweeps across stay dark. In `05-heart-night.png` the shaft
  points into the sky top-left, and nothing in the town knows it is there. This is the biggest gap in the "magic" read.
- **The tower body is a cold slab at night.** The firelight stops at the lantern colonnade. Below the cornice the shaft
  is a flat moonlit blue-grey with a few `tower_windows`, and the four bronze tritons (`pharos_geo.py` `figure_triton`) are
  dark silhouettes.
- **Lamps come on all at once.** `lights-system.ts` `lhGlow()` is a global smoothstep of `uWindowGlow`. Windows gate on a
  hashed `uWindowOcc` (`materials.ts` ~L698), so they come on in random order, but nothing spreads in space. Riding lights
  follow the same clock (`fleet-system.ts` L51). There is no keeper or lamplighter (no matches in `life/`).
- **Unlit is merely off.** In `05-heart-unlit.png` the tower just loses its flame. The town, the mirror and the statue
  give no sign that something is missing. It reads as "not loaded", not as "the light has gone out".
- **A low score reads only as faint.** With TREMOR at 55 (`05-heart-dusk-tremor.png`) the reach is about 0.10. The shaft
  is short and amber but barely legible, and the 6 s rhythm cannot be seen in a still. Reach is "how far the light goes",
  yet nowhere in the world marks where it lands.
- **Moon, stars and the moon glitter path already exist** (`sky/palette.ts`, `ocean-material.ts` L314). The water reflects
  the town's lights through the pool RT (L279). Night is already beautiful at the town scale. What is missing is the
  dialogue between the Pharos and that town.

## 2. Ideas

### P1 The beam as a real light (the sweep lights what it crosses)
**What:** A shared GLSL function `hbBeamLight(worldPos, normal)` built from the existing `BeamUniforms` (pos, angle, shape,
col). It does a cone membership test (axial distance `s`, radial `r`, the same `R0 + s·tan(HALF)` and the same falloff as
the shaft) times a wrap-diffuse `N·(-ax)`, scaled by `uBeamCol`. Inject it into the kit materials' emissive or radiance
step (`world/materials.ts`, alongside `GLSL_ENV`) and into the fleet material (`fleet/fleet-material.ts`). As the shaft
swings, sails flare warm and walls and hillsides take a soft travelling patch. A ship under the beam glows for a beat and
then falls back into moonlight. There are no shadows, but you could add a cheap self-occlusion by fading where
`dot(N, toLantern) < 0`. Also brighten the `lights` sprites a touch when they sit inside the cone, so the quay lamps
"answer" the light.
**Why magical:** This is the lighthouse moment: the light visibly passing over the world, ship by ship, once every
revolution.
**Data/meaning:** This extends the existing PSI signal and adds no new cue. The light falls off with reach (score), takes
the lamp colour (band) and keeps the rhythm (period), so a low score lights only the near harbour. Its DOM equivalent is
the existing Pharos panel.
**Where:** `beam/uniforms.ts` (add a `uBeamFall` vec2 for the falloff constants so all consumers match), `world/materials.ts`,
`fleet/fleet-material.ts`, `lights/lights-system.ts` sprite vertex shader.
**Cost:** M. 0 draws, 0 tris. About 20–25 ALU per lit fragment behind a uniform branch (`uBeamCol` ≈ 0 by day, so it is
skipped). On an iGPU, under 0.1 ms at 1080p.
**Risk:** Calm, as long as the gain stays below the quay-lamp pools; it must never strobe. Perf is fine. Under reduced
motion the beam is held, so the patch becomes a still, slowly swelling pool, which is good.

### P2 Daylight heliograph (the mirror throws the sun)
**What:** By day the bronze mirror throws a soft, sun-coloured ellipse that crosses the water and the walls at the PSI
rhythm. It reuses the P1 path with a day colour of `uSunColor` × mirror albedo, a narrower core and no volume. The patch
lands at about 0.35·L along the heading, so on a sunny noon you see a bright coin of light sliding over the Roads once
per period.
**Why magical:** The ancient wonder working by day. Most visitors see noon, and right now noon has no beam at all apart
from the glint.
**Data/meaning:** This is the existing rhythm and reach shown by day. It is not a new cue, but the day read of the PSI
period becomes far more legible. Its DOM equivalent is the existing panel. The caution lamp (`dayPresence`) can widen the
patch, as it already widens the glint.
**Where:** `beam-system.ts` (day term in `bu.uBeamCol`, now about 0.1 by day), `ocean-material.ts` beam term, P1 injection.
**Cost:** S once P1 exists (it is uniforms only).
**Risk:** Must stay gentle, as dappled sunlight rather than a spotlight. Overcast DEWS weather should dim it (×
`1 - cloud`), which is truthful because no sun means no heliograph.

### P3 The lamplighting wave at dusk (and the dousing at dawn)
**What:** Lights come on as a wave that radiates from the Pharos. The Pharos fire is lit first, then the mole and the
pierheads, then the quays, then the town's windows. Concretely, `lhGlow(kind)` becomes
`smoothstep(a + k·dPharos, b + k·dPharos, uWindowGlow)`, where `dPharos` is computed in the vertex shader from `iPos`
against a new `uPharosXZ` uniform. The window gate in `materials.ts` becomes
`step(hbWhite(id) + k·d, uWindowOcc + k·dMax)`, and riding lights use the same offset. At dawn the wave runs in reverse,
so the town goes dark from its edges and the Pharos is the last to bank. The wave spans about 20–30 min of world time (tune it against the real
time-of-day clock rate).
**Why magical:** "The lighthouse lights the town." It is a ceremony you catch at dusk without being told.
**Data/meaning:** Purely decorative (time of day).
**Where:** `lights/lights-system.ts` (GLSL_GLOW, pool pass), `world/materials.ts` window emissive, `fleet/fleet-system.ts`
riding-light glow, `engine/uniforms.ts`.
**Cost:** S. A few ALU, 0 draws. Note that the pool RT is projected once per version change, so the pool should be
scaled in the sampling materials, not baked.
**Risk:** None to truth. It must stay slow and soft, never a "loading" sweep. When the Pharos is unlit, the wave still
runs (it is time of day), but it starts from the town edge instead (see P4).

### P4 The banked fire: a poignant unlit Pharos
**What:** When `psi.lit` is false, the brazier is banked, not erased. A dull, desaturated ember-bed glow remains (no
flames), with a thin grey wisp of smoke at a third of the plume's puffs and opacity. The mirror is turned down and still,
which reads as resting rather than held. The Helios statue loses its uplight. Inside the lantern a single tiny
keeper's hand-lamp burns, a cool-white pinprick, the "vigil". With P3, the town's lamps still light, but the wave starts
from the far quays and stops short of the dark tower.
**Why magical:** It reads as a vigil, not a crash: the harbour waiting for its light.
**Data/meaning:** This is the existing `lit=false` state, not a new cue. The DOM equivalent is already there
("unlit · no stability reading"). The ember bed must avoid the red alarm hue (use a brown-grey with only a whisper of
warmth) so it cannot be read as CRISIS.
**Where:** `beam/fire.ts` (a `banked` path: an ember-bed uniform, plume puff count and opacity),
`world/lighthouse-system.ts` (mirror tilt and uplight), one `lights` entry for the vigil lamp.
**Cost:** S. It renders less than the lit state.
**Risk:** It must still be distinct from SYNCING boot (`psiTried` already gates that). Keep the vigil lamp small, so it
does not read as "lit, white = steady".

### P5 Firelight down the tower; tritons and Helios catch the light
**What:** A warm vertical gradient in the tower material: `lamp × level × flicker × exp(-(yLantern - y)/18) × (N·up-ish
wrap)` on the upper storeys, so the cornice, the parapet and the tritons pick up firelight from above. The tower windows
light from the top down over dusk, as if a keeper were climbing the stair with a lamp (P3's wave at the tower scale).
Each triton gets a brief rim flare as the beam azimuth passes its diagonal: the CPU computes four weights into a `vec4`
uniform, and the shader picks the right one by the fragment's quadrant. The Helios torch picks up a small glint on each
flash.
**Why magical:** The wonder stops being a grey pillar with a fire on top. It becomes a lit monument, and its bronze
figures come alive at the rhythm.
**Data/meaning:** Decorative, coloured by the existing lamp colour (band), so a red CRISIS fire reddens the cornice too,
which is consistent.
**Where:** Tower material in `world/lighthouse-system.ts` (the tower and statue meshes are already one draw each),
`scripts/harbour/blender/pharos/pharos_geo.py` (optional: a vertex-colour mask for tritons and statue, so no quadrant
hack is needed), `fire.ts` flicker export.
**Cost:** S. About 10 ALU on one mesh, 0 draws.
**Risk:** Keep it below moonlight contrast at the base, because the tower should still read as stone.

### P6 Where the light lands: a reach footprint on the sea
**What:** Add a soft, elongated landfall glow on the water at the end of the useful reach (s ≈ 0.6·L), where the
down-tilted shaft "touches" the sea. It is a brighter ellipse in the ocean beam term that slides around the harbour
circle once per revolution. A long reach (BEDROCK 98) sweeps far out past the Roads. A short one (TREMOR 55) circles
inside the harbour mouth.
**Why magical:** The beam becomes a ring the light traces on the sea.
**Data/meaning:** It makes the existing score → reach mapping legible. The radius equals reach, which is honest because
it is monotonic and continuous. The DOM equivalent is the score in the panel, and the hover fact could add
"reach ≈ N stadia" only if wanted. This is not a re-mapping.
**Where:** `ocean/ocean-material.ts` beam term (uses `uBeamShape.x`), optionally P1's material term.
**Cost:** S, a few ALU in the ocean.
**Risk:** Must not look like a UI ring. Keep it as broken, ripple-modulated light, as the town reflections already are.

### P7 The beam through the smoke, and under the clouds
**What:** (a) Add the P1 cone test in `PLUME_FRAG` so that when the shaft swings through the smoke column, the puffs
flare in lamp colour. (b) In the sky shader, add a cone ∩ cloud-layer term, so a long beam faintly lights the
undersides of the low cloud banks it passes beneath.
**Why magical:** The light shows up in the air, not only as a shaft, so the smoke and the sky take part in it.
**Data/meaning:** Decorative extension of the beam. (b) scales with reach, and the clouds themselves are DEWS-bound, so
this is a nice coupling and lies about nothing.
**Where:** `beam/fire.ts` plume, `sky/sky-glsl.ts`.
**Cost:** (a) S, 30 puffs. (b) M, about 15 ALU on sky pixels only, cheap.
**Risk:** (b) must be faint, a glow and not searchlights on clouds (no tech-demo spectacle).

### P8 The fire draws with the trend (score vs 24 h average)
**What:** The fire shows the direction of the PSI over the last 24 h. If the score is above `avg24h`, the fire "draws
well": flames slightly taller, more vent embers, a cleaner and paler plume. If it is below, the flames are lower and the
plume is heavier and darker. It is clamped to a few percent per point and eased over minutes.
**Why magical:** The light looks like it is breathing up or labouring, which is a felt sense of momentum.
**Data/meaning:** **A new analytical cue** (Δ = score − avg24h, from `/api/stability-index`). It needs a DOM equivalent:
add "rising / falling vs 24 h average (±x.x)" to the Pharos panel next to the existing 24 h average row
(`ui/Panel.tsx` L230) and to the hover fact. It must not alter the reach, colour or rhythm.
**Where:** `model/readings.ts` (expose the trend), `readings-system.ts`, `fire.ts` uniforms, `ui/Panel.tsx`, `ui/facts.ts`.
**Cost:** S. Uniforms only.
**Risk:** It could be confused with the score-driven level. Keep it subtle and opposite in kind: the plume and embers
carry the trend, the beam carries the level. Reduced motion holds the embers, so the plume tone carries it alone.

### P9 Votive lamps for a band that has risen
**What:** When the PSI band has improved within the last 24 h (from `stability.history`), a ring of small clay votive
lamps burns along the Pharos terrace parapet for that night. These are tiny `lights` entries with sprites only (no
pools), about 24 of them.
**Why magical:** A quiet festival, a harbour giving thanks.
**Data/meaning:** **A new cue**, derived from history. The DOM needs a panel line such as
"band rose to STEADY · <date>". It shows only on improvement and never on decline, so that there is no mourning
iconography; the decline is already told by the beam.
**Where:** `readings-system.ts`, `lights/lights-service.ts` (a "votive" kind), `ui/Panel.tsx`.
**Cost:** S. Instanced sprites already exist.
**Risk:** Asymmetric by design. Debate whether a celebration is "trading urgency". Keep it lamp-sized and night-only.

### P10 The keeper's lamplighters
**What:** At dusk, two or three lantern-carrying walkers leave the Pharos causeway and walk the mole and the quays. The
quay lamps near each one light as they pass, driving P3's wave from actual walkers.
**Why magical:** A human scale for the ceremony.
**Data/meaning:** Decorative.
**Where:** `life/folk.ts` (lantern walkers exist: `LANTERN_SHARE`), `life/walkways.ts`, `lights-service.setOn`.
**Cost:** M. Walker routing, setOn churn means pool re-projection (`version++` re-renders the 2048² RT; cost per re-render not measured
), so throttle it.
**Risk:** Folk are tiny at the default zoom. It mostly reads in close views, and it overlaps with vertical "life".

## 3. Top picks (impact ÷ cost)

1. **P1 The beam as a real light.** It is the missing half of the hero effect, and it lights ships, sails and walls on
   every pass. It costs 0 draws and is tied to the exact PSI.
2. **P3 Lamplighting wave.** It costs a few ALU and makes dusk a ceremony centred on the Pharos, without touching truth.
3. **P4 Banked fire / vigil.** It is cheap and turns the one failure state into something poignant and legible, while
   remaining honest (it is the same `lit=false`).
4. **P5 Firelight down the tower and triton rim flares.** It fixes the cold grey slab in every night frame on one mesh.
5. **P2 Daylight heliograph.** It almost comes free with P1 and gives noon visitors the PSI rhythm on the sea.

Next tier: P6 (reach legibility, cheap) and P7a (beam in the smoke).

## 4. Cross-vertical hooks

- **Ocean / water:** P1, P2 and P6 extend the ocean's beam term, so they share falloff constants (`uBeamFall`) with the
  shaft so that all consumers agree.
- **Fleet / sails:** P1 needs a hook in the fleet material. Sail translucency (light through canvas) would make the
  beam pass sublime.
- **Weather (DEWS):** P2 dims with cloud, P7b uses the cloud layer, and the existing `precip.ts` beam-in-rain stays.
- **Sky:** P7b, plus the moon path versus the beam patch, which should never compete in one frame.
- **Life / folk:** P10 lamplighters, P3 timing.
- **Audio (opt-in):** a soft fire-crackle swell when the beam faces the viewer, and a single bell at the moment the
  Pharos is lit (P3 wave start), off by default as D13 requires.
- **UI / panel:** P8 trend row and P9 band-rise line are required for D11 if those cues ship.

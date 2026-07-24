# PharosVille Visual Poetry Enhancement Plan

Date: 2026-07-24
Status: Draft for operator review — nothing implemented yet.

Companions:
[`2026-07-24-threejs-visual-revamp-plan.md`](./2026-07-24-threejs-visual-revamp-plan.md)
("Lantern Sea", V0–V6, implemented — this plan builds on it, does not redo it),
[`2026-07-24-threejs-legacy-cleanup-tasklist.md`](./2026-07-24-threejs-legacy-cleanup-tasklist.md)
(in flight; this plan's prerequisites depend on it).

Evidence: code inventory of `src/three/**`, fresh screenshot audit in
`outputs/visual-audit/` (triptych + close-ups + `critique.md`), and two
external research passes (art direction; ortho/stylized water rendering).

## Why we are here

V0–V6 delivered a technically solid night scene ("Lantern Sea"), but the
operator's verdict after living with it: **still far from the mark** —

- Ship models are very basic.
- The lighthouse is simple; it needs to be massive, epic, beautiful.
- The sea and sea zones are lackluster (zones may be repositioned and
  enlarged).
- Water — especially by day — reads as "a blue square".
- The whole should feel like a **digital Japanese garden**: relaxing,
  poetic, and still an informative visualization of Pharos data.

## Core Diagnosis (what the research proved)

1. **The flat day look is authored, not accidental.** Decision D1 (V-plan)
   clamped day to a "pearl overcast" grade: `DAY_GRADE` saturation 0.72,
   grey lift (`src/three/garden-post.ts:62-71`), over water colors
   `DAY_BASE ≈ #4e5f8a` / `DAY_DEEP ≈ #182041` (`garden-water.ts:39-44`).
   The grey-blue square in the audit screenshots is numerically the authored
   value. D1 must be revisited: pearl-overcast read as *muddy*, not *calm*.
2. **Every beauty system is night-gated.** Moon road, glitter, beam cone,
   dust, stars, fireflies, strong bloom — all multiplied by `night`/`dusk`
   terms that are ~0 at midday (`garden-water.ts:241-254`,
   `garden-day-cycle.ts:182-197`). Day has no hero effect at all; bloom
   threshold 0.55 is crossed by nothing in daylight.
3. **The water's one daytime detail system fades out where the camera
   sits.** Normal-map detail falloff (`garden-water.ts:152-154`) kills the
   normal maps beyond 70–260 units from a camera at 110–190; `distanceFade`
   (`:296-297`) flattens far water further. There is no env reflection, no
   true depth color, no caustics, no cloud shadows.
4. **The lighthouse is proportionally small.** ~19.8 units tall on a
   37-unit-wide island, vs titan ships ~16.6 long (`garden-models.ts`,
   `garden-observatory-slice.ts:18-20`). That is *realistic* lighthouse
   proportion — and reads as a pale peg at diorama scale. By day its beam is
   invisible and its beacon doesn't bloom. Epic needs exaggerated scale plus
   tiny human-scale cues beside it.
5. **Ships are 150–250-tri extrusions** (5-vertex hull polygon, 1 sail per
   mast, box cabins), with the data-side 0.7–3.0 size range **clamped to a
   2.2× visual range** (`garden-ships.ts:264`). Even hero GLBs are 331/507
   tris against manifest budgets of 2,500–3,500. At default framing a ship
   is ~4–5% of frame height — most authored detail is below pixel scale.
6. **Sea zones are small, saturated, decal-like.** Radius is
   `5.2 + min(3.8, √count·0.78)` world units (`garden-zones.ts:35-36`) on a
   ~79-unit sea; the DEWS colors (`#22c55e…#ef4444`, `palette.ts:143-149`)
   fight the muted day grade. Positions are fixed data
   (`risk-water-areas.ts:47-195`), clustered NE/W — the bottom-left quadrant
   is a dead grey expanse in the audit shots.
7. **The dusk state effectively doesn't exist** (audit finding): daylight
   factor is already 0 by 18:30, so "dusk" screenshots are identical to
   night. The most poetic hour is missing.
8. **Structural headroom problems:** normal sessions never reach the `full`
   tier (it is reduced-motion-only, `render-scheduler.ts:91`), and the
   renderer chunk has **~0.1 KiB gzip left** against its 200 KiB budget —
   new features need the legacy cleanup (in flight) to free bytes first.
   The triangle budget (60k) is barely used (~43k at overview): there is
   room to spend geometry on beauty.

## Art Direction: "The Garden Sea" (庭の海)

V-plan's "Lantern Sea" stays as the **night** identity. This plan's binding
statement covers the whole day:

> A garden made of sea. The water is the raked sand — open, banded with
> light, rippling in slow rings around stone. The lighthouse stands like a
> mountain in a Hiroshige print: impossibly tall, alone, warm at its crown.
> Ships cross the emptiness like brushstrokes — dark hulls, curved sheer,
> one colored sail each. Cloud shadows drift. Nothing hurries. The data is
> the weather.

References that anchor the look (research-proven, not vibes):

- **Ukiyo-e / Hiroshige**: Prussian-indigo dominance with one vermillion
  accent; *ichimonji bokashi* gradient bands at sky and horizon; flat
  pattern-like waves; asymmetric composition; generous negative space.
- **Townscaper**: orthographic seaside diorama; richness from color +
  organic wonk + edge foam, not reflection tech; toy-scale cues (tiny
  doors, benches, dinghies) that sell monumentality.
- **Monument Valley**: "every screen a work of art"; one idea per frame;
  detail concentrated at tops of forms; flat shading + strong baked AO.
- **Karesansui / Sakuteiki**: stone groupings in odd numbers, one dominant
  vertical + subordinate horizontals; concentric raked ripple rings around
  stones → concentric animated ripple rings around island, rocks, ships.
- **Journey**: one monumental vertical landmark visible from everywhere;
  thresholded glitter to make bright surfaces alive without bloom reliance.

### Time-of-day identity (revised — replaces D1)

| State | Character |
| --- | --- |
| **Day (co-hero)** | Ukiyo-e morning: saturated-but-harmonious teal-to-indigo banded sea, warm key sun + cool fill, sun glitter on wave facets, drifting cloud shadows, crisp shadows, bokashi sky gradient. Calm ≠ desaturated. |
| **Dusk (fixed)** | Ember horizon, warm/cool split, lanterns just lit — must be a real, distinct state again (fix the daylight-curve bug). |
| **Night (hero, kept)** | The Lantern Sea as built in V0–V6: indigo, moon road, blooming lanterns, volumetric beam. |

### Palette contract

Keep `HARBOR_PALETTE` as the source of truth, but **re-author the day
preset**: raise saturation back (target ≈ 0.9–1.0 in the grade), day water
as sky-family turquoise→indigo HSV ramp, warm cream/ochre stone accents,
and reserve ONE vermillion/warm accent for the lighthouse crown + danger
semantics. Zone colors get a day-adapted luminance-matched variant so they
harmonize instead of clashing.

---

## Workstream G: Foundations (must land first)

- [ ] **G1. Settle the cleanup.** The legacy-cleanup tasklist
  (`2026-07-24-threejs-legacy-cleanup-tasklist.md`) deletes
  `classification-to-boat.ts`, sprite identity fields, and ~4.4 MiB of
  Canvas-era assets, and frees renderer-chunk bytes. **Do not start
  visual packets until it lands** — several W-items touch the same files.
- [ ] **G2. Reclaim bundle headroom.** After cleanup, re-measure
  `scripts/bundle-budgets.mjs`; this plan estimates +8–15 KiB gzip of new
  shader/geometry code. If headroom is still <5 KiB, raise the renderer
  chunk budget with measured cause (as done in V5) — beauty is the product
  now.
- [ ] **G3. Fix the tier policy.** `full` tier must be reachable in normal
  sessions on healthy hardware (currently reduced-motion-only). Re-tune
  `render-scheduler.ts` hysteresis so a desktop iGPU in budget runs at full;
  keep reduced-motion behavior unchanged (post allowed, motion frozen).
- [ ] **G4. Fix the dusk curve.** Rework the daylight/dusk/night blending in
  `garden-day-cycle.ts:88-97` so 17:00–20:00 is a genuine ember-horizon
  state, with its own grade preset and the sky showing a warm west band.
- [ ] **G5. Re-author the day grade** (`garden-post.ts:62-71`,
  `garden-day-cycle.ts:24-38`): saturation ~0.95, remove the grey lift,
  warm highlights / cool-teal shadows split-tone, sky zenith a real blue
  (bokashi: deep at top → pale warm at horizon), fog color matched to the
  horizon band. Supersedes D1.

Exit gate: day/dusk/night triptych where all three states are visibly
distinct and the day frame no longer reads grey; debug fields confirm the
tier reached in a normal session.

---

## Workstream W: The Day Sea (kills the "blue square")

Extends `garden-water.ts` (single plane, single material stays). All
techniques below are research-validated as **works-as-is under ortho**
(constant view vector is a stability gift, not a curse).

- [ ] **W1. Banded depth color (the big one).** Replace the ±6% sine-ribbon
  fake depth (`garden-water.ts:157-162`) with a real shallow→deep ramp:
  HSV-lerped turquoise→saturated blue→deep indigo-violet, **posterized into
  3–5 bands** (ukiyo-e flat-band read). Depth source: the analytic shore
  SDF the shader already has for foam, extended with a few authored
  bathymetry ellipses (shallow shelves around island, islets, docks) — no
  depth prepass needed at this stylization level.
- [ ] **W2. Sky env tint.** Add one small PMREM/cubemap (or analytic
  gradient) sky sample to the water, weighted by an authored world-space
  mask (stronger toward frame edges = fake horizon sheen, suppressed over
  shallow bands), shimmered by the existing dual scrolling normals. This is
  the highest value-per-ms fix for "flat fill": the sea becomes sky-lit.
- [ ] **W3. Sun glitter (the daytime moon-road).** Thresholded high-exponent
  Blinn specular on the scrolling normal maps — lives in the normals, so it
  works under ortho; sparse extreme sparkles pushed >1.0 HDR feed the
  existing bloom (Journey sand-glitter technique). Scale glitter density
  with `seaState` as moon-road does at night.
- [ ] **W4. Drifting cloud shadows.** 1–2 cloud-noise textures scrolled in
  world-XZ space, multiplied into the water light term AND the island/ship
  lighting (via the same texture lookup or a shared uniform). One fetch,
  ~0.2 ms, camera-agnostic — the single biggest "alive and hypnotic" win
  for day. Bonus: reuse the cloud mask to modulate glitter (sun-dappled
  patches).
- [ ] **W5. Karesansui ripple rings.** Concentric expanding ripple rings
  (SDF-based, 2–3 phase-offset bands) around the island, islets, dock
  pylons, and slowly around moored ships — the literal 3D analog of raked
  sand around stones. Replaces/extends the current single foam ring; calm,
  on-theme, view-independent. Keep lapping shore foam from V2 inside the
  innermost ring.
- [ ] **W6. Keep night systems.** Moon road, lantern lanes, night glitter
  untouched — W1's banded ramp has a night variant (indigo bands), W2's env
  tint becomes moonlight at night.
- [ ] **W7. De-fade the normal maps.** Re-tune `detailFalloff`/`distanceFade`
  so normal detail survives at the default framing distance; gate by tier
  instead of by distance alone.

Exit gate: day sea at the standard framing shows banded color, sun
glitter, drifting cloud shadows, and ripple rings; night sea unchanged in
character; recovery tier still ≥45 FPS.

---

## Workstream L: The Lighthouse (massive, epic, beautiful)

The lighthouse is the composition's mountain (Journey principle) and the
PSI data hero. It must dominate the frame from every zoom.

- [ ] **L1. Scale up decisively.** Target height ~28–34 world units (from
  19.8) — roughly 1.6–1.75×, so it reads ~2× a titan's height and ~75–90%
  of the island's width in vertical presence. This is deliberate Monumental
  Valley / ukiyo-e exaggeration, not realism. Re-anchor: beam origin,
  beacon light, label, selection, shadow frustum, camera fit.
- [ ] **L2. GLB v3 silhouette.** New deterministic generator
  (`generate-garden-lighthouse.mjs` successor): strong continuous taper;
  broader stepped base rooted in a rock cluster (not one cylinder); flared
  gallery with pronounced corbels; taller glazed lantern room; a slim
  spire/finial crown. Detail concentrated in the top third + waterline,
  clean shaft (Monument Valley capital logic). Vertex-color stone gradient
  wet-dark→pale-warm. Budget: raise manifest cap from 1,600 tris to
  ~3,000–4,000 — the triangle budget has 17k spare; spend it here first.
- [ ] **L3. Tiny scale cues (what makes it read huge).** A miniature keeper's
  door at the base, 2–3 tiny window slots up the shaft, a small rowboat on
  the lee shore, starfish/stones at the waterline. Toy-scale references
  beside a big simple mass = epic (Townscaper/Janrike principle).
- [ ] **L4. Day presence.** Today the tower is a "pale peg" by day: give it
  warm-sun-catch materials (light stone that takes the warm key, copper
  roof that catches a glint), a subtle rim accent, and let it cast a long
  soft shadow across the island/sea by day (extend the D3 shadow frustum
  if needed, island + near water only). The beacon stays off by day — the
  silhouette is the day statement.
- [ ] **L5. Night presence kept + upgraded.** Beam cone, dust, beacon bloom
  from V3 stay; with the new height, re-tune beam length (~55–60) and the
  water beam lane so the sweep still crosses a meaningful arc of sea.
- [ ] **L6. PSI semantics unchanged.** Beacon intensity/pulse keeps encoding
  PSI stress exactly as today; scale-up must not change any DOM/label/ARIA
  contract.

Exit gate: cold-shown night AND day screenshots where the lighthouse is
unambiguously the hero; operator confirms "massive, epic, beautiful".

---

## Workstream S: The Fleet (from toys to brushstrokes)

Order: hull shape language first (every ship benefits), then scale
contrast, then heroes. Extends `garden-ships.ts` + hero generator.

- [ ] **S1. Curved sheer line (non-negotiable).** Replace the 5-point hull
  polygon with an 11–15-point profile: deck rises toward bow and stern
  (parabolic sheer already exists on deck plates — extend it to the hull
  itself), slight tumblehome (deck narrower than waterline), flared/raked
  bow per family. ~8–15 extra vertices per hull; research consensus is this
  is 80% of the "ship vs bathtub" difference.
- [ ] **S2. Bellied sails + angled yards.** Displace the sail center row
  (one extra vertex ring) so sails read wind-filled; yaw yards a few
  degrees; masts slightly raked. Flat paper sails = toy; billow = alive.
- [ ] **S3. Sparse real rigging.** 4–6 lines per mast (forestay, backstay,
  two shrouds) replacing the current 3 stays; still one batched
  `LineSegments` per ship-tier, fat lines for titans as today.
- [ ] **S4. Color blocking.** Dark hull band + lighter sheer stripe + warm
  deck + cream/ochre sails; ONE colored accent per ship (pennant/painted
  stern) — this accent slot doubles as the data channel (chain/status hue),
  coordinated with the existing livery system so semantics are preserved.
- [ ] **S5. De-compress the scale range.** Relax the 0.72–1.6 clamp
  (`garden-ships.ts:264`) toward a ~3.5–4× visual spread (titans must
  visibly dwarf fishing boats; keep a floor so small ships stay legible and
  clickable). Re-check collision/label layout and the zone placement
  solver for the larger footprints.
- [ ] **S6. Heroes earn their budgets.** Titan/heritage GLBs currently use
  331–507 tris of 2,500–3,500 budgets. Regenerate at ~1,500–3,000 tris:
  full sheer + tumblehome, stern castle / raked clipper bow per family,
  multi-sail plans with billow, carved-ish figurehead/emblem, banner with
  vertex wave. Vertex-colored, no textures, as the manifest discipline
  requires.
- [ ] **S7. Grounding.** Ships currently float on blob decals; strengthen:
  darker, slightly elongated contact shadow + the W5 ripple rings at the
  waterline of moored/slow ships. Keep instanced quad wakes for movers.
- [ ] **S8. Motion poetry.** Keep the V4 motion hierarchy; add a barely
  perceptible heel into turns and pennant flutter; titans slowest. All
  frozen under reduced motion, as today.

Exit gate: day close-up triptych (small ship / heritage / titan) where
each reads as a crafted wooden vessel with a curved sheer; at overview,
the size hierarchy is obvious at a glance.

---

## Workstream Z: Sea Zones & Waters Composition

Operator has authorized repositioning and enlarging the zones. This is as
much **composition** work as rendering work (ma: cluster interest, leave
open water).

- [ ] **Z1. Recompose the map.** New zone layout (data change in
  `risk-water-areas.ts` + display-shift logic in
  `garden-observatory-slice.ts:160-170`): spread the six areas to activate
  the dead bottom-left quadrant and balance the frame — e.g. pull DANGER
  and WARNING further apart, move one calm/watch zone SW. Constraints:
  `risk-water-placement.ts` terrain validity, world-layout risk rings,
  label collision, DOM truth unchanged. Propose the layout as a map sketch
  in the implementation packet and get operator sign-off before coding.
- [ ] **Z2. Enlarge the zones.** Raise base radius and the √count scaling
  (e.g. `8 + min(6, √count·1.1)` → ~8–14 world units, ellipses ~1.3×/0.8)
  so zones read as *bodies of water*, not rings. Decision D-Z2 below: the
  count→radius encoding is semantics — enlarge the mapping, keep the
  monotonic encoding.
- [ ] **Z3. Organic zone rendering.** Perimeter dashes → slightly irregular,
  hand-drawn-feel broken rings (vary dash length/gap with stable noise);
  buoys upgraded to small floating markers that bob on the W-swell; zone
  tint in the water shader becomes a soft-edged band (smoothstep falloff
  instead of hard ellipse) with day-harmonized, luminance-matched colors
  (muted teal-green calm → deep amber warning → ember danger) that stay
  inside the garden palette. Band color + buoys + DOM label keep non-color
  redundancy (visual invariant).
- [ ] **Z4. Shakkei horizon (borrowed scenery).** 2–3 distant hazy island
  silhouettes at the far sea edge (pre-fogged flat meshes/cards, near sky
  color) + the bokashi sky gradient from G5. Sells scale and depth for
  ~zero cost; makes the sea feel like it extends to a horizon instead of
  ending at a fog wall.
- [ ] **Z5. Garden islets.** Add 2–3 small poetic islets in open water (a
  tall craggy "crane" rock, a long low "turtle" reef — Sakuteiki odd-number
  groupings, 3 stones leaning toward each other), with W5 ripple rings.
  They give ships something to navigate around and break the emptiness
  *intentionally* (composed ma, not void). Purely decorative — no data
  semantics, no labels.

Exit gate: overview screenshot where all six zones read as composed
regions of a painting (not stickers), the bottom-left is no longer dead,
and the horizon feels borrowed; zone semantics tests pass.

---

## Workstream I: Island & Garden Polish

- [ ] **I1. Stone groupings.** Re-audit island rockwork against Sakuteiki
  rules: odd clusters, one dominant vertical stone + subordinate
  horizontals, stones leaning "in conversation", best faces toward the
  camera. Adjust boulder scatter tables; cheap (instancing exists).
- [ ] **I2. Mirror basin.** Make the harbor/reflection-pond patch visibly
  stiller than open sea (suppress normal scroll + swell amplitude inside
  the harbor SDF; boost the W2 env tint there): still water = mirror =
  mono no aware; the calm contrast makes the open sea's motion poetic.
- [ ] **I3. Cloud shadows on land.** W4's cloud mask also sweeps the island
  and ships (shared uniform), so light weather drifts across the whole
  garden.
- [ ] **I4. Warm micro-life (restraint).** Keep V6 fireflies/gulls/mist;
  add at most: laundry-lantern string on the keeper cottage, clothesline
  pennant, and the L3 rowboat. Every addition needs a subtraction
  candidate — ma.

---

## Workstream P: Post, Sky & Final Grade

- [ ] **P1. Bokashi sky dome.** (With G5.) 2–3-stop vertical gradient,
  deep indigo-teal zenith → pale warm horizon; optional second gradient
  band reflected in the far water (W2 mask does this).
- [ ] **P2. Aerial perspective bands.** Ensure 3 value/saturation depth
  bands read at the default framing: island (full color) → midground ships
  (slightly lifted) → Z4 horizon islets (near sky color). Mostly fog +
  pre-fogged cards; verify against the pearl-fog retune.
- [ ] **P3. Tilt-shift miniature blur (optional, full tier only).** A
  separable band blur growing with distance from the frame's focus line —
  the diorama/miniature look, ~1–2 ms. Ship only if P1–P2 still leave the
  frame feeling flat; skip if the budget ladder complains. Decision D-P3.
- [ ] **P4. Shadow quality.** Day key sun slightly lowered for longer soft
  shadows; confirm the lighthouse's new long shadow (L4) inside the island
  frustum; shadow budget unchanged (1024/512/off ladder).

---

## Guardrails (unchanged contracts, restated)

- **Semantics first.** Zone bands, ship states, dock health, PSI beacon keep
  non-color redundancy (buoys, labels, DOM, ARIA). No post pass or palette
  change may carry exclusive meaning. `VISUAL_INVARIANTS.md` updated with
  Z2/Z3 changes (as done for D2 in the V-plan).
- **Accessibility.** Reduced motion: post/grade stay, all motion (ripple
  rings, cloud shadows, glitter animation, swell, sway) freezes; water
  holds one static detailed frame; zero continuous RAF. Desktop gate: new
  textures/GLBs load only behind it. No strobe (danger flicker stays
  motion-gated).
- **Performance ladder.** New effects join the tier ladder: W3 glitter and
  W4 cloud shadows are cheap and ship at balanced+; W5 ripple rings
  full/balanced; P3 tilt-shift full-only. Recovery/constrained keep the
  current graceful fallbacks. Budgets: p90 ≤ 20 ms at 1440×1000 on the
  reference machine; ≤60k triangles; ≤150 draw calls aimed; renderer chunk
  gzip re-baselined after G2. Measure before/after each workstream; the
  running budget table discipline from the V-plan applies.
- **Data integrity.** Zone repositioning (Z1) touches
  `risk-water-areas.ts` and its placement/label tests; ship scale (S5)
  touches placement/collision tests; lighthouse scale (L1) touches anchors,
  label, beam, camera fit, and any visual spec referencing proportions.
  All semantics tests must pass; no DOM/ARIA changes.

## Verification loop

- Reuse the V-plan loop: `npm run capture:triptych` per packet into
  `outputs/`, plus a new **day-hero close-up set** (lighthouse day,
  titan day, zone overview day). The operator reviews images, not prose.
- The 2026-07-24 audit ran at the *constrained* tier (headless GPU) —
  every exit gate in this plan requires a **full/balanced-tier capture**
  (`__pharosVilleDebug` must show the tier in the evidence JSON).
- `npm run validate:changed` per packet; `npm run validate:release` before
  any release claim. No push without explicit operator instruction.

## Sequencing

Dependency-ordered; each phase independently shippable:

1. **P0 — Foundations** (G1–G5). G1 waits on the in-flight cleanup; G4/G5
   are small and unlock honest triptychs for everything downstream.
2. **P1 — The Day Sea** (W1–W7). Biggest visible jump for the stated
   complaint; mostly one shader file — serial.
3. **P2 — The Lighthouse** (L1–L6). GLB regen + re-anchoring; can start
   in parallel with P1 (different files) but its shadow work (L4) merges
   after P1's water.
4. **P3 — The Fleet** (S1–S8). S1–S4 serial in `garden-ships.ts`; S6 hero
   GLB regen parallel; S5 scale de-compression last (placement tests).
5. **P4 — Zones & Composition** (Z1–Z5). Z1 layout sketch → operator
   sign-off → implementation; Z2–Z5 parallelizable packets.
6. **P5 — Island & Post polish** (I1–I4, P1–P4), then final measurement
   sweep and triptych review.

Orchestration: reuse the V-plan's Orchestration Playbook verbatim (packet
contract, single-writer integration, report caps, measurement discipline).

## Open Operator Decisions

| ID | Question | Recommendation |
| --- | --- | --- |
| D-R1 | Supersede D1 ("pearl overcast day") with the saturated ukiyo-e day as co-hero state? | **Yes** — the audit proves D1 produced the muddy grey the operator dislikes. |
| D-Z2 | Zone radius keeps encoding ship count, but with a larger mapping (~8–14 units)? | **Yes** — keep monotonic data encoding, just bigger; zones become "bodies of water". |
| D-L1 | Lighthouse scale-up to ~28–34 units is a deliberate unrealistic exaggeration — confirm. | **Yes** — Monument Valley/Journey monumentality; realism reads small at diorama scale. |
| D-P3 | Ship tilt-shift miniature blur (full tier only)? | Defer — evaluate after P1+P2 screenshots; the scene may already read deep enough. |
| D-S5 | De-compress ship scale to ~3.5–4× spread? | **Yes** — titans must dwarf; small-ship legibility floor preserved. |

## Research Provenance

Distilled from four parallel research passes (2026-07-24):

1. **Codebase inventory** (`src/three/**`, `src/systems/**`, budgets,
   cleanup tasklist) — all numeric claims above cite file:line.
2. **Visual audit** — triptych + close-ups + debug dump in
   `outputs/visual-audit/` (note: captured at constrained tier on headless
   GPU; findings about authored values verified against code).
3. **Art direction research** — Townscaper rendering reverse-engineering
   (reindernijhoff.net), Janrike low-poly lighthouse breakdown
   (exp-points.com), Monument Valley design talks, ukiyo-e bokashi
   (aisf.or.jp Jaanus), Sakuteiki stone rules, Journey sand glitter
   (alanzucconi.com), low-poly craft guides (80.lv, retrostylegames.com).
4. **Water/day rendering research** — stylized water under ortho
   (ameye.dev, roystan.net, cyanilux.com), cloud shadows via world-space
   projection, N8AO, tilt-shift vs DOF; with explicit ortho-suitability
   triage (works-as-is / needs authoring / avoid) and per-ms cost estimates.

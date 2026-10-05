# L06 — Terrain, landform, shore

## Verdict
The land is composed as a camera-coverage device, but insufficiently as a garden: huge smooth green planes, stepped headland bands and square exterior limits overpower the smaller authored details. The biggest lever is replacing the near-seat lawn with a materially distinct, asymmetric moss–stone–gravel composition, then carrying that material and landform logic through the shore. More fog or finer noise will not deliver the step change.

## Evidence
1. **Hypotheses 1 and 2 confirmed for land, with a technical correction.** `outputs/holistic/day.png` (bottom approximately 28%) shows a broad smooth bank with a blurry pale patch, isolated lantern and dark rock lump; the foreground does not read as moss or a composed stone garden. The top-left bough also reads as chunky pads, but vegetation owns that diagnosis. This is **not simply flat shading**: threshold and rim explicitly use smooth shading and uniform roughness 0.98 (`src/three/garden-threshold.ts:804–806`; `src/three/garden-rim-mesh.ts:1375–1381`). Raising subdivision or disabling flat shading cannot fix their material vocabulary.
2. **The blank bank is authored, not an accidental omission.** Its brow is specified in screen rows to hide ocean without hiding hulls (`garden-threshold.ts:94–108`); height is a concave fall plus sinusoidal swells (`:156–170`), and colour is broad/fine sine variation plus soft value masks (`:235–263`). The bible requires three smooth, textureless draws within 15k construction triangles (`docs/pharosville/VISUAL_INVARIANTS.md:47–57`), enforced by tests (`garden-threshold.test.ts:197–221`). This locks out much of the surface information the nearest, largest land area needs.
3. **Hypothesis 1's floating square plate confirmed perceptually.** `outputs/holistic/overview.png` (near corner and both long near edges) exposes straight-sided land margins around a square basin. The authoritative field literally uses minimum distance to the four map edges (`src/systems/garden-rim.ts:204–213`). Decorative south/east skirts exist, but extend only approximately 4.5 tiles; north/west get none (`garden-rim-mesh.ts:56–60,277–295`). Water already has a 20-world-unit outer crossfade (`src/three/garden-water.ts:143–149`). Therefore “add an annulus/fog” repeats an existing mechanism; it does not address the land silhouette. No literal floating underside is established by this capture.
4. **The headland has detail, but its dominant form remains tiered.** `day.png` (tower foot) shows stacked moss ledges and a smooth pale toe. The code already has an 80-cell smooth heightfield, height/slope colours, roughness texture and fragment strata/wet/notch treatment (`garden-island.ts:330–342,369–387,446–447,451–563,934–940`). However, bench shape is still successive radial overrun thresholds, and the shore cap follows an ellipse (`:350–361`). Surface finish changes colour only, explicitly not roughness or normals (`src/three/garden-crag-finish.ts:10–26`). This is a silhouette/material separation problem, not absence of any terrain shader.
5. **Shore transitions exist but do not read convincingly.** Rim coastal archetypes are assigned by hashed 11-tile patches except at stations (`garden-rim-mesh.ts:501–508`), then rendered as coloured vertical courses and shallow shelves (`:511–548`). At rest, land-to-water contact often looks like a smooth cut edge. Conversely, the small sand tongue beside the island is the **analytical tidal flat**, with existing dry/wet/mud colours, derivative-filtered ripple marks and wet roughness (`garden-tidal-flat.ts:187–213`); do not replace it with decorative oscillating surf.
6. **Hypothesis 3 confirmed for foreground night, not diagnosed as terrain alone.** `night.png` (bottom third/headland) collapses into nearly black masses. A previous threshold night-floor increase already improved measured values but remained below targets; A2 craft was rejected as indistinguishable (`agents/2026-10-02-visual-upgrade/02-execution-record.md:15–20`). Lighting and atmosphere must participate; microtexture alone will disappear at night.
7. **Spend intelligently, not indiscriminately.** Baseline reports 179 calls, 179 geometries, GPU frame p95 3.17 ms, 374,708 triangles and 50 textures (`outputs/holistic/day.json:30,51–56,1699–1700`). Threshold itself already totals 14,788 triangles across its three census entries (`:601–615`), almost exhausting its local ceiling. RTX headroom is not proof of M5 Pro performance; stricter acceptance is 480k triangles/60 textures (`CONTRACTS.md:390–392`).

## Levers — ranked

### 1. Author the near-seat ground as one garden composition
**Change:** Replace `garden-threshold.ts` interior height/colour masks with an asymmetric low moss island, one recessed gravel/earth channel and a half-buried stone grouping; connect their beds to vegetation placement masks. Retain the tested outer brow coverage envelope, deck and shaded recess, rather than adding a prop carpet. Replace the existing isolated lump/featureless patch, not the empty inlet.
**Impact 5/5:** Converts the largest close-view land surface into legible garden space. **Effort L. Risk:** foreground steals attention or covers vessels.
**Contracts:** Challenge textureless prescription, not hierarchy/shade (`VISUAL_INVARIANTS:38–57`); preserve analytical neutrality and finite field (`CONTRACTS:214–219`). Fund geometry by replacing existing land/stone parts.
**Dependencies:** vegetation, rest-seat camera, key/shadow lighting. **Verification:** noon/golden/night and both size-gate captures; 16px blur must still favour tower/inlet; threshold coverage tests including arrival/breath poses and revised resource assertions.

### 2. Give land a shared, restrained material grammar
**Change:** Share a packed, locally generated or checked local moss/earth/stone/gravel material set across threshold, rim and crag. Use authored material weights plus slope/height masks; world-planar mapping on ground, triplanar on steep stone, shallow normal/roughness relief and derivative/mipmap detail fade. Extend the existing material-patch chain, not a parallel renderer. Remove replaced per-island texture generation.
**Impact 5/5:** Moss reads fibrous, rock bedded, gravel granular, and wet shore damp instead of all surfaces reading coloured clay. **Effort M. Risk:** repetition, shimmering and excessive fragment samples.
**Contracts:** Explicitly relax `VISUAL_INVARIANTS:56–57`; preserve palette anchors (`:114–122`), shared atmosphere and `CONTRACTS:383–395`. Target ≤3 additional textures, no new terrain draws; measure, do not promise savings.
**Dependencies:** lighting, noise/asset ownership, water contact masks. **Verification:** material/disposal tests; rest and overview texture/draw censuses, DPR2 temporal crops and M5 Pro GPU p95. Reject detail invisible at rest.

### 3. Separate the finite data domain from the visible landscape boundary
**Change:** In `garden-rim-mesh.ts` and `garden-horizon.ts`, replace narrow exterior extrusion with a few irregular decorative land aprons, recessed coastal bites and overlapping borrowed headlands. Join their feet visually to the existing water annulus; keep both navigable openings open. Author the overview silhouette too, not only the seated projection. Never enlarge the classification field.
**Impact 4/5:** Removes the board-game square and makes the harbour part of a coast. **Effort M. Risk:** extra landscape hides stations or suggests navigable territory.
**Contracts:** Preserve `CONTRACTS:216–219,248–258`; north/west apron exceptions require revising current mesh-bound tests (`garden-rim-mesh.test.ts:293–310`). Decorative, unpickable, outside berths; census-funded geometry.
**Dependencies:** horizon/sky visibility, overview LOD, water annulus. **Verification:** overview/noon/night plus pan/zoom captures; unchanged field/berths/openings; rim geometry/sea-region tests; overview texture ceiling.

### 4. Replace concentric benches with a geological headland and continuous shore contact
**Change:** Keep `islandTerrainHeight` as furniture's source, but author unequal lateral rock shoulders, one dominant inclined face and interrupted planted pockets inside the existing exclusion ellipse. Use coherent coastal segments rather than hashed coast-form patches; share dry/damp/submerged material masks with water, with sparse interrupted foam only on exposed coast. Preserve the tidal flat's area/wrack semantics.
**Impact 4/5:** Tower sits on weathered land instead of a green tiered pedestal. **Effort M. Risk:** stairs/pond stop bedding correctly; decorative wet bands imitate supply tide.
**Contracts:** `VISUAL_INVARIANTS:5–17,40–45`; `CONTRACTS:227–242`; no new risk classifier or tide animation. Replace detail rather than growing triangles.
**Dependencies:** precinct furniture, water/reflection, supply-tide DOM parity. **Verification:** headland/shore crops at noon/golden/night; island bedding/exclusion and tidal-flat tests, matched flood/ebb/unavailable states, census and GPU timing.

## Do-not-do / traps
- Do not apply erosion noise everywhere: a tended garden needs authored space, not generic wilderness.
- Do not add uniform foam collars, pebble scatters or saturated lawn textures; they create competing rings/noise.
- Do not increase fog to hide the square: PSI owns clarity, and that also conceals analytical content.
- Do not repeat rejected small craft/value adjustments. Require whole-frame improvement, not prettier isolated crops.

## Invariants worth challenging
Challenge the **textureless threshold**, not Japanese restraint. Three draws/15k triangles are implementation constraints rather than the brand; retain them where batching permits, renegotiate only measured replacement deltas. Also challenge procedural-only media wording (`CONTRACTS:399–403`) if checked local authored material/height assets materially outperform generated ones. Preserve desktop gate, finite truth, DOM parity, reduced-motion completeness, tower hierarchy and GPU caps.

## Captures wanted
Run serially on the reference GPU; compare matched live-data baselines and changed frames. These are requests, not executed checks.

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#t=12.25' --clean --draw-census --texture-census --out levers/l06-day.png --json levers/l06-day.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#t=18.5' --clean --out levers/l06-golden.png --json levers/l06-golden.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#t=22' --clean --out levers/l06-night.png --json levers/l06-night.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#cam=0,0,0.28&t=12.25' --clean --draw-census --texture-census --out levers/l06-overview.png --json levers/l06-overview.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1200 --height 640 --hash '#t=12.25' --out levers/l06-wide.png --json levers/l06-wide.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 900 --height 720 --hash '#t=12.25' --out levers/l06-gate.png --json levers/l06-gate.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#t=12.25' --reduced --clean --out levers/l06-reduced.png --json levers/l06-reduced.json
```

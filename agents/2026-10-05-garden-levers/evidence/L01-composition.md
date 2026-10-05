# L01 — Art direction & whole-frame composition

## Verdict

The app has an authored harbour view, but not yet an authored **garden experience**: its most garden-sized surface is a smooth green bank, while the fleet and monumental tower supply nearly all recognizable content. The largest lever is to redesign the seat-to-water sequence and the projected distribution of masses together—not add Japanese props or refine individual polygons.

## Evidence

1. **H1 confirmed, with qualification.** `overview.png` shows a square, detached plate, perimeter sheds, repeated green mounds and a central monument: a tabletop harbour. At rest, the plate edge is successfully concealed and the tower has strong sky clearance (`day.png`, centre-right); low polygon count alone is not the problem. Detailed stone architecture against inflated smooth terrain and mushroom trees creates inconsistent material/scale language. The garden brief explicitly rejects literal cultural decoration (`PRODUCT.md:37–42`).
2. **H2 confirmed.** In `day.png` the near bank occupies roughly the lower quarter-to-third, with a small unreadable lantern, almost invisible stones, and a broad blurred green highlight. The top-left branch is a heavy angular arm ending in solid flattened discs; `day-1200x640.png` exposes the whole three-disc motif, while `day-900x720.png` crops it to a stub. Actual stones and stepping stones exist (`src/three/garden-threshold.ts:365–405`), but existence is not perceptual presence. The bible mandates textureless, three-draw construction and fixed inward-only pads (`VISUAL_INVARIANTS.md:47–57`); implementation uses smooth vertex-coloured materials (`garden-threshold.ts:804–827`). Thus “flat-shaded” is not literally true of this foreground, though it reads simplified.
3. **Ma exists locally, not as a whole harbour rhythm.** The inlet between near ships and tower is clear in `day.png` and `reduced.png`; refute a claim that there is *no* negative space. **H4 confirmed in the distant middle strip:** hulls/sails become a nearly continuous horizontal barcode on both sides of the tower, with coloured near sails competing with the left precinct. Unequal 3/5/7 moorings are already required (`CONTRACTS.md:264–284`), but their grouping is not legible from the seat. World-space clustering does not guarantee projected cluster separation.
4. **Shakkei is present but shallow.** `day.png` has layered mountains and a large sky band, and dawn/golden improve atmosphere; absence of borrowed scenery is refuted. However, two similar-height planted cliff masses bracket a largely horizontal harbour band; smooth far ridges look like a backdrop rather than an extension of the garden. The horizon literally follows the eye without parallax (`src/three/garden-horizon.ts:34–51`). Near/mid/far are identifiable, but their transitions lack a convincing continuous land-and-water composition.
5. **Miegakure and wabi-sabi are weak at rest.** The garden is presented as an exposed bank; no legible path disappears into a recess, and the little stones do not establish an unequal, half-buried grouping (`day.png`, bottom). Weathered tower masonry is the strongest age cue, isolated from uniformly smooth ground, crisp shed roofs and repeated tree pads. Existing analytical fallen-coin stone garden is intentionally outside the rest frame (`CONTRACTS.md:253–258`); moving those records into foreground decoration would confuse meaning.
6. **H3 confirmed compositionally, not causally.** Noon’s blue-grey middle distance merges fleet/shore; night retains tower and ridge silhouettes but turns the lower garden into a black block (`night.png`). Dawn and golden distinguish masses better; blue retains more harbour information than night. The documented night lift remained below the value targets (`02-execution-record.md:15–20`). Seasonal garden expression is not legible in these same-date frames; **[INFERENCE]** it may be stronger on other dates, which these captures cannot establish. Calendar/phenology already exist (`ARCHITECTURE.md:73–79`).
7. **H5 confirmed but not an art-direction cause:** the failure caption visibly interrupts the foreground in chrome captures, especially `day-900x720.png`. `selected-usdc.png` demonstrates a separate inspection shot, not evidence that the rest garden reads well. Reduced motion preserves the same composition; extra animation cannot repair it.

## Levers — ranked

### 1. Author a real seat-to-water garden

**Change:** Replace the broad undifferentiated bank in `garden-threshold.ts` with one deliberate asymmetric composition: a continuous quiet gravel interval, two unequal moss shelves, a half-buried 3-stone grouping and a stepping path that disappears behind the larger stone. Rebuild the cropped pine as tapered branch/twig hierarchy and porous needle masses, not six isolated discs. Reuse the existing lantern and engawa; displace lawn and tiny scattered stones rather than accumulate props. Seasonal dressing uses existing calendar phenology on one subordinate near plant, not a new spectacle.

**Impact 5/5:** puts recognizable garden spatial grammar in the area viewers actually see. **Effort L. Risk:** texture noise or a bright gravel patch becomes a second hero. **Touched:** challenge bible §Hierarchy (`47–57`) exact pads/texturelessness/local budget; preserve hero, shade, colour anchors and global caps (§Contracts Light/budgets `383–395`). **Dependencies:** terrain, vegetation, materials, rest-seat and shadow owners. **Verification:** matched preview day/night/gate/reduced captures, whole-frame plus 16px notan and foreground crop; meaningful threshold resource/occlusion and camera projection tests. Success is an unmistakably different garden at thumbnail scale, not merely more triangles.

### 2. Compose projected flotillas, not a sail inventory

**Change:** In `garden-fleet-placement` and fleet near/far presentation, arrange existing moorings as a few unequal visible masses with generous water intervals between them. Keep all eligible hulls and complete cloth identity; reserve near visual weight for a few readable leaders, let distant groups recede in detail/chroma. Test the projected occupied footprint and inter-group gaps from both rest eyes in addition to world-space spacing. Do not change risk classification to achieve the picture.

**Impact 5/5:** ma becomes readable across the entire harbour and data gains hierarchy. **Effort M. Risk:** crowding moves elsewhere or distant boats lose inspectability. **Touched:** bible `38–67`; Contracts Fleet `264–284`, partition `233–242`, shared picking `298–301`. **Dependencies:** placement, motion/water safety, data-legibility, hit targets. **Verification:** live and dense preview captures at both gates and overview; fleet-placement/thinning, motion exclusion and ledger/picking parity tests; retain eligible count.

### 3. Replace tabletop massing with a continuous landscape

**Change:** Re-author `garden-rim-mesh`, sea-edge geography and headland silhouettes as unequal connected landforms: one dominant oblique shore, a lower broken counterpart, fewer repeated mound-and-tree assemblies. Vary exposed rock/moss transitions at coherent scales. Keep the Pharos hero, but demote fortress-like base/precinct surfaces through landscape overlap and weathering. In overview, dissolve the square *visual* edge with irregular decorative skirt/shore treatment, not an infinite new navigable world.

**Impact 4/5:** removes the toy tray/prop-set reading without demanding photorealism. **Effort L. Risk:** decorative shore contradicts navigation or hides ships. **Touched:** bible `5–17`, `40–45`; Contracts Geography `248–258` (two openings, finite rim/skirt limits), global budgets. **Dependencies:** terrain, architecture, exclusion field, camera. **Verification:** rest/overview real-GPU captures, shoreline and island safety tests, selection sightline/pick tests; owner-attributed triangle/draw deltas.

### 4. Make depth readable at every real hour

**Change:** Recompose `garden-horizon`, shared aerial/day-cycle and sky contacts as separated overlapping value planes. Break the matching left/right cliff-height rhythm; maintain the crown’s sky gap. Lift *specific* night land/air separations and reveal a restrained garden surface plane—not all lamps or global exposure. Preserve PSI-owned haze and actual solar time.

**Impact 4/5:** borrowed scenery becomes part of a spacious landscape and night remains a usable contemplative frame. **Effort M. Risk:** atmospheric changes counterfeit market clarity or wash out darkness. **Touched:** bible Value plan `27–36`, Atmosphere `69–95`; Contracts Light `342–384`. **Dependencies:** lighting, sky, water/reflection, grading. **Verification:** five-beat previews/notan/value metrics, night-water metrics, sky/PSI/day-cycle tests; retain beacon dominance.

## Do-not-do / traps

- No asset checklist of torii, bamboo, koi and red maples. Garden principles precede recognizable ornaments; no new monument.
- No fleet deletion, fake financial aggregation or hiding hulls to manufacture calm; hide-and-reveal applies to garden path/scenery.
- No more isolated pad notches, tiny hull-width changes or grove craft without whole-frame evidence: A2/B1/P1 were rejected as indistinguishable; W1 was not warranted (`02-execution-record.md:17–20`).
- RTX headroom is not permission to spend attention or assume M5 Pro performance. Baseline day records 179 calls, 2.47ms GPU p50 and 184 ships (`outputs/holistic/day.json:30,55,103`).

## Invariants worth challenging

Challenge exact six pads, inward-only shaping and textureless three-draw foreground (`VISUAL_INVARIANTS.md:47–57`): these prescribe the failing representation. Challenge exact numerical seat pose (`19–25`; `CONTRACTS.md:291–297`) only alongside threshold re-authoring; retain an authored seated perspective, right-of-centre hero and clear inlet. The solver objective only measures tower anchors and station intrusions (`camera.ts:409–411`), not garden readability. Keep truth, full-fleet, time, access, attention and global resource rules.

## Captures wanted

Run serially on real GPU; repeat candidate/baseline against the same fixture/date when isolating art changes. These are requests, not checks run in this review.

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05 --hash '#t=12.25' --width 1600 --height 1000 --still-camera --metrics --value-plan --draw-census --out levers/l01-day.png --json levers/l01-day.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05 --hash '#t=22' --width 1600 --height 1000 --still-camera --metrics --value-plan --night-water --out levers/l01-night.png --json levers/l01-night.json
```

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --hash '#t=12.25' --width 1200 --height 640 --out levers/l01-wide.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --hash '#t=12.25' --width 900 --height 720 --out levers/l01-compact.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture dense --hash '#t=12.25' --reduced --out levers/l01-dense-static.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --hash '#cam=0,0,0.28&t=12.25' --clean --out levers/l01-overview.png
```

For lever 4, repeat the first invocation with `#t=7`, `#t=18.5`, `#t=19.2` and distinct outputs. For seasonal evaluation, repeat it with clocks `2026-03-20`, `2026-06-21`, `2026-12-21`; seasonal identity must survive static viewing.

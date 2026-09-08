# Island + Lighthouse — reborn review

Lane: centrepiece rock, tower, precinct, garden props, beacon, GLB.
Evidence base: `src/three/garden-{island,lighthouse,precinct,beacon-fire,models,signal-mast}.ts`, `scripts/pharosville/generate-garden-lighthouse.mjs`, `docs/pharosville/{ASSET_PIPELINE,VISUAL_INVARIANTS}.md`, frames `noon.png`, `morning.png`, `night.png`, `noon-pharos-close.png`, `night-pharos-close.png`.

---

## 1. Verdict

The centrepiece reads as a **fortified Pharos keep on a rock**, not a Japanese garden island with a lighthouse. The tower is the tallest object and the night hero (warm stone + flame vs cool sea), but at the modal noon rest frame it shares one cream value plane with the sky and loses silhouette punch (`noon.png` @ centre; `noon-pharos-close.png`). Garden vocabulary **exists in source** (niwaki, karikomi, Sakuteiki triads, raked path, reflection pond, pavilion, quay stair, unequal obelisk gateposts) yet **fails the rest-zoom blur audit**: those elements are invisible or sub-pixel while crenellated curtain walls, bastions, and arrow slits dominate the secondary read. The operator goal (“digital Japanese garden, pleasant to watch, tower as anchor”) is not met; the island is a military plinth for a good Alexandrian silhouette.

---

## 2. Findings

### Tree / prop census (from source)

| Element | Count / draws | Source |
| --- | --- | --- |
| Niwaki (hero pines) | **5** pines, **21** foliage pads, 2 draws (`island-niwaki-trunks` / `-pads`) | `garden-island.ts:1306-1373`, `:1405-1476` |
| Karikomi (clipped azalea) | **23** domes, 1 draw; cap 30 | `:1074-1173`, test pins 23 |
| Sakuteiki stones | **5 triads × 3 = 15** instances, 1 draw | `:1014-1045`, `:1184-1230` |
| Path lanterns | **2** (pedestal/lamp/cap instanced) | `:136-139`, `:1232-1277` |
| Rock tiers | **3** main + **3** planted shelves + 1 shoal disc | `:173-177`, `:582-649` |
| Precinct | 4 draws: masonry, cliff, recesses, gate window | `garden-precinct.ts:33-155` |
| Quay stair | treads + cheeks instanced | `garden-island.ts:2000-2054` |
| Obelisk gateposts | **2** unequal | `:1787-1859` |
| Danger rock face | 1 instanced run NE | `:1881-1936` |
| Pavilion | 1 (observatory copper cone) | `:1490-1530` @ `(4.4, 2.35)` |
| Reflection pond | 1 skin + rim + koi | `:1617-1669` @ `(8.0, 6.0)` |
| Signal mast | 1 (renderer-owned) | `world-renderer.ts:3254-3261` @ `(7.2, 3.2)` |
| Lighthouse GLB | **37 160** tris, **7** draws, 233 KB meshopt | `garden-models.ts:230-307` |
| World trees (prior audit) | **41** total; island owns **5** of them (niwaki only) | consolidated plan T2.2 |

Drawable ceiling after merge: **exactly 49** (`garden-island.test.ts:205`). Headroom under 55/77 exists but is deliberately pinned.

### DEFECT (broken vs own intent)

1. **Sakuteiki stones are buried.** Code admits every triad sits at or below surface; dominant clears ~0.1, subordinates under entirely (`garden-island.ts:1058-1066`). Intent: “odd-numbered clusters… visible at rest.” Reality: invisible. Karikomi skirts against stones were dropped *because* stones are gone — defect left standing.

2. **Garden program fails rest-zoom legibility.** Path gravel (`:1704-1761`, raked normal), karikomi, pavilion, pond rim, and triads are authored for a garden read; `noon.png` / `noon-pharos-close.png` show none of them. Only a left-side pine clump (~2–4 canopy masses) and a stair read. Own contract: precinct carries three secondary reads — pavilion, pond, mast (`VISUAL_INVARIANTS.md:300-310`) — yet two of three are sub-threshold at the default camera.

3. **Day beacon is architecturally present, optically absent.** Flame banks to `0.26×` day (`garden-day-cycle.ts:339-340`); beam cone/dust/plane suppressed by `(1 - daylight*0.9)` / `(1-daylight)` (`:448-450`). Day signal is meant to be smoke + mirror glint (`:337-351`); frames show a gold cupola only — no readable plume or glint at rest (`noon.png` @ lantern).

4. **Night beam does not land as a sea road.** Cone opacity night peak ~0.11; still frames show local warm catch, not a sweep (`night.png`, `night-pharos-close.png`). Invariant wants beacon dominant + moon road secondary (`VISUAL_INVARIANTS.md:274-283`); the volumetric beam is not earning that role.

### GAP (works, not amazing)

5. **Fortress vocabulary owns the secondary silhouette.** `createGardenPrecinct` is named `island-fortified-precinct` (`garden-precinct.ts:35`): 10-course curtain, merlons, four bastions, arrow slits, open gate arch (`:70-128`). Invariants explicitly call this “masonry, not a monument” (`VISUAL_INVARIANTS.md:303-305`), but the *eye* reads castle. Japanese-garden cues never compete.

6. **Tower vs sky value is flat at noon.** Shell albedo is pale warm foam/lantern mix (`garden-lighthouse.ts:79-80`); sky is the same cream band. Hero works vs water and at night; fails the day sky cutout the brief needs.

7. **Island scale loses to the fleet carpet.** Footprint ~ ellipse r≈17–20u (`ISLAND_TIERS`, shoal 19.6); tower 38u crown (`GARDEN_LIGHTHOUSE_HEIGHT`). Grove mass ≈ a few large hulls (`noon.png`). Rest zoom 0.72 was reopened so the fleet reads — and the garden disappeared under it.

8. **Waterline is a dark rock lip + translucent shoal disc**, not a gardened shore (`garden-island.ts:582-594`, strata/tide wear `:215-229`, `:833`). Contact shadow exists (`morning.png`) but no moss skirt, gravel beach, or soft wet dissolve beyond vertex tint.

9. **GLB fidelity is strong for a keep, weak for a garden hero.** Generator: ashlar courses, baked AO, Triton finials, Zeus, open lantern (`generate-garden-lighthouse.mjs` structure; 37k tris). No day lens/glass, no interior optic, no material break that pops against noon haze. Fallback shell merges to ~material groups (`garden-lighthouse.ts:749-758`) — silhouette-aligned, correct.

10. **Landing is a fort gate, not a garden threshold.** Quay stair → east arch (`:1966-1978`); torii lives at Calm Anchorage mouth tile `{55,99}` (`garden-torii.ts:21`), not on the island. Islets (crane/turtle/lone) are distant Sakuteiki props (`garden-islets.ts`), unbridged to the Pharos.

11. **Pavilion is an observatory instrument hut** (copper cone + gilt sphere, `:1490-1530`), not a tea-house / enza that would garden-signal the rock.

---

## 3. Ideas (ranked)

*Cost key: draws / tris / tex / ms + eng S/M/L/XL. “Displaces” = three-secondary-reads rule or attention budget.*

### R1 — STEP CHANGE: Demilitarize the precinct into a shoin court
**What:** Replace merlons, bastions, arrow slits with low dry-stone / timber engawa, open engawa corners, pale court gravel continuous with the path, one torii-scale gate (not castle arch). Keep cliff plinth and stylobate clearance. Files: `garden-precinct.ts` rewrite; rim-light still on court mass; re-pin `garden-island.test.ts` precinct names + drawable 49.
**Why:** The single largest anti-garden signal is the fort. Removing it lets tower + true garden reads own the silhouette without raising the tower.
**Cost:** 0–1 net draws (still 4 merged buckets); tris similar or −; eng **L**. Risk: medium — many tests name `island-precinct-*`; camera/obstacle ellipse may shift.
**Displaces:** Fort curtain *as military read* (invariants already deny it monument status — argue the masonry language is the bug). No new secondary monument.
**Deps:** Shore/vegetation lane (moss on new court); camera may re-fit slightly.

### R2 — STEP CHANGE: Make garden props survive the 16px blur audit
**What:** (a) Unbury stones: seat each triad on `islandTerrainHeight` + half-height, lift y 0.4–0.9; (b) thicken path half-width 1.28→~2.0 and lighten gravel albedo one stop; (c) raise karikomi radius ~1.4× and extend walk past pavilion; (d) enlarge pond to ~5.5 r and pavilion roof span so both clear blur. Optional: one maple (vermillion autumn pad set) as 6th foliage instance family on existing niwaki draw or +1 draw.
**Why:** Vocabulary is paid for and invisible — highest ROI on existing geometry.
**Cost:** 0 draws if maple on existing batch; else +1; +2–8k tris; eng **M**. Risk: low–med; re-pin karikomi count 23, drawable 49→50, stone triad tests.
**Displaces:** Empty terrace *ma* in the path bend — accept denser edge; do **not** add a fourth monument.
**Deps:** None hard; pairs with R1.

### R3 — STEP CHANGE: Day tower hero — lens, exclusive bloom, water catch
**What:** Lantern gains a clear/glass material (procedural shell + GLB generator): cool transmission + day emissive whisper; mirror glint already exists — raise day visibility; **post:** bloom threshold gated so only beacon/mirror/lantern glass bloom at day; water: strengthen island-local specular column from beacon anchor (no full planar reflection — prior reject stands). Night: raise beam cone opacity and drive a single rotating sea-lane uniform in water shader from beam yaw.
**Why:** Tower must win noon and night without being a cream stick. Frames show day cupola-only and night local glow without road.
**Cost:** GLB regen (pipeline); +0–1 draw glass; post uniform; water uniform; eng **L**. Risk: med — bloom can milk the frame; night beam must stay under “one dominant light.”
**Displaces:** Global bloom generosity; any competing emissive lift on hulls/windows.
**Deps:** Sky/atmosphere/post lane; water lane (beam road). Re-pin beam opacity tests, model hash, `check:garden-models`.

### R4 — Landing sequence: torii at quay + yatsuhashi to a satellite islet
**What:** Move or duplicate decorative torii from distant Calm mouth to quay stair foot (or replace obelisks as gateposts — fukinsei pair → vermillion torii + one stone). Bridge (3–5 plank spans, 1 instanced draw) to a new or relocated small islet 8–12u off the lee shore with one pine + one triad (pull from `garden-islets` budget / redistribute, do not raise ambient counts).
**Why:** Garden entry ritual; island stops being a keep approached by siege ramp.
**Cost:** +1–2 draws, ~3–6k tris; eng **M**. Risk: med — obstacle field, ship clearance, “no free-standing monument” if torii reads as fourth secondary.
**Displaces:** **Obelisk gateposts** (explicit replace) and/or distant torii attention; islet pine from rim/islet pool (redistribute).
**Deps:** Fleet placement clearance; islets lane; camera left-edge framing.

### R5 — Tsukiyama rock rewrite (procedural)
**What:** Replace near-cylindrical terraces with 2–3 composed hill lobes (tsukiyama), moss caps as vertex colour fields, gravel “beach” arc on camera lee, one visible dry waterfall stain (not a sim). Keep precinct plateau footprint for tower contract.
**Why:** Rock currently reads moulded fort apron despite strata shader (`:215-229`).
**Cost:** 0 draws (same tier meshes), retopo tiers; eng **L**. Risk: med — `islandTerrainHeight` seats path/stair/lanterns/koi; many pins.
**Displaces:** Smooth concentric shelf read.
**Deps:** Water shore-distance (T3.2) for wet edge.

### R6 — Scale: island bigger *or* ships quieter (argue reverse of rest-zoom intent)
**What:** Prefer **A:** scale island root ~1.25–1.35 (tiers, precinct, offsets) keeping tower world height; or **B:** rest zoom 0.72→0.85–0.9 and thin fleet visual weight (already a fleet lane). Argue explicit reversal of “rest shows harbor not window” only if A alone is insufficient.
**Why:** Grove ≈ hull is the carpet problem’s local face.
**Cost:** A: eng **M**, re-pin camera/fit/obstacles; B: fleet+camera lanes. Risk: high on B (operator rest-zoom decision).
**Displaces:** Some open water *ma* near island; or fleet detail at rest.
**Deps:** CameraComposition, FleetMotionDensity.

### R7 — Beacon fire daymark that actually reads
**What:** Day smoke opacity 0.62 is authored (`garden-day-cycle.ts:345`) but fails frames — enlarge plume quads, lift against pale sky (darker dayDark), add slow column sway; keep flame banked. Mirror glint peak already HDR — ensure post doesn’t crush it.
**Why:** Cheapest path to “alive at noon” without night-only heroics.
**Cost:** 0 draws; shader constants; eng **S**. Risk: low.
**Displaces:** Nothing structural; may slightly compete with station smoke — keep station unlit/ember.
**Deps:** Post exposure; station-smoke uniqueness invariant.

### R8 — Pavilion → chaseki (tea hut) silhouette without new monument
**What:** Re-skin observatory: thatched irimoya / dark timber, lower copper cone, remove gilt instrument ball or sink it. Same root, same secondary slot.
**Why:** Copper observatory reads “scientific fort accessory,” not garden.
**Cost:** 0 draws; eng **S–M**. Risk: low.
**Displaces:** Observatory instrument read (intentional).
**Deps:** None.

### R9 — Night composition lock
**What:** Author one rest-night framing: tower warm, beam yaw parked toward camera-side water for stills / slow sweep otherwise; suppress ship lantern attention inside island exclusion radius; moon road as sole secondary.
**Why:** Night already almost works (`night-pharos-close.png`); finish the hierarchy.
**Cost:** 0–1 uniform paths; eng **S**. Risk: low if ember gains untouched.
**Displaces:** Competing ship-lantern pools near island.
**Deps:** AmbientLifeLight, water moon road.

### R10 — GLB micro-fidelity pass (only after R1–R3)
**What:** Generator: lantern glass panes, deeper window reveals, moss vertex in lower courses, optional bronze gallery rail catchlight. Stay inside 45k tris / 8 draws budgets (`garden-models.ts:295-306`).
**Why:** Shell is already the best asset; don’t spend XL before demilitarization.
**Cost:** pipeline regen; eng **M**. Risk: low if anchors preserved.
**Displaces:** None if budgets hold.
**Deps:** ASSET_PIPELINE discipline; `check:garden-models`.

---

## 4. Rejected

- **Raise tower height / add fourth monument** — violates three-secondary-reads; silhouette already tall enough; problem is base language + value, not metres.
- **Planar reflection of whole tower** — already rejected (~40 draws); fresnel/PMREM/beam-lane path preferred (R3).
- **More free-standing lanterns on terrace** — explicit prior reject; empty terrace is a feature (`VISUAL_INVARIANTS.md:311-312`).
- **Alpha-card maple forest** — N8AO `transparencyAware=false` turns cards into solid blocks (documented `:1068-1070`).
- **Delete beacon fire for a clean Fresnel lens only** — fire is the night brand and PSI carrier; glass *adds*, doesn’t replace.
- **Hand-edit GLB** — pipeline only (`ASSET_PIPELINE.md`).
- **Relitigate T2.2 karikomi as “done”** — shipped, but rest frames show it did not land visually; this review treats visibility failure as in-scope, not re-litigation of the plant choice.

---

## 5. Cross-lane notes

| Lane | Need / hand-off |
| --- | --- |
| **Water** | Beam sea-road uniform; stronger island contact/shoal; optional tower streak without planar pass; shore-distance if tsukiyama wet edge. |
| **SkyAtmospherePost** | Noon value separation tower/sky; bloom exclusivity for glass/mirror/beacon; grade so cream-on-cream dies. |
| **FleetMotionDensity / CameraComposition** | Carpet vs island scale (R6); clearance for bridge/islet; rest zoom debate. |
| **ShoreRimVegetation** | Moss language shared with demilitarized court; maple species if separate draw. |
| **AmbientLifeLight** | Do not raise koi/birds; keep 4 koi readable if pond enlarges; ember discipline near island at night (R9). |
| **DataInformativeness** | Mast/pennants/storm cone stay; pavilion re-skin must not invent new analytics; PSI still on beacon. |
| **RenderArchitecturePerf** | Headroom real (~233 calls / 355k tris); R1–R4 fit; pin drawable 49→new ceiling deliberately. |
| **Asset / models** | Any lantern glass = generator + manifest hash + fallback shell parity. |

**Implementation sketch (top two):**
1. **R1 procedural:** rebuild `createGardenPrecinct` buckets — cliff kept; masonry courses → low wall + engawa slabs; delete bastion/merlon loops; gate → simple stone/torii opening; keep `LIGHTHOUSE_WINDOW_MATERIAL_NAME` on one aperture; re-run obstacle ellipse helpers in island tests.
2. **R2 procedural:** `createIslandDecoration` stone `scratchPosition.y = islandTerrainHeight(x,z) + scale*k`; path halfWidth; karikomi radii; pond `CircleGeometry` radius; no GLB. Maple = extra pad tone channel on niwaki autumn path already half-there (`:1456-1457`).

**Priority cut for the one massive session:** R1 + R2 + R3 + R7 first; R4/R8 if attention budget remains; R5/R6/R10 only with explicit scale/post buy-in.

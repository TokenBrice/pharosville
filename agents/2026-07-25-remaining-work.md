# PharosVille — Round H/L/S state

Date: 2026-07-25 (supersedes this file's earlier four-task note, all of which
shipped in `0ffefa9`).
Context: `agents/2026-07-25-grand-scale-revamp-plan.md`.
Source: four operator findings with screenshots — harbours in the middle of the
island, the Pharos ("random buggy text" plus not epic enough), the sea and its
zones needing clarification, and the world still feeling crowded.

State: 901 tests green, `npm run validate` clean, 1881.6 KiB raw / 535.6 KiB
gzip. Local `main` is 59 commits ahead of the remote and nothing is pushed.

---

## What shipped

### H1 — harbours ring the coast (`22f8676`)

Three stacked causes, all real:

1. `gardenDockDisplayTile` displaced dock index 1 by (+3, +5) — a composition
   nudge from when two representative docks rendered. With ten harbours it
   walked one of them five tiles inland.
2. **The rendered island is not where the terrain field says it is.** The rock
   model is seated at the lighthouse tile plus `GARDEN_ISLAND_TILE_OFFSET`,
   ~6 tiles south of the terrain ellipse. A dock tile genuinely on the terrain
   coast could sit several tiles inside the rock the viewer sees. This is the
   one to remember: any future feature placed from terrain coordinates will hit
   it.
3. `GARDEN_DOCK_SEPARATION_TILES` was 7, wider than the spacing between
   adjacent coastal slots, so it rejected every other harbour.

The twelve dock tiles are now derived from twelve bearings around the island,
each marched out to the last land tile before water, skipping the bearing that
lands on the Pharos promontory. The data tile keeps its terrain meaning; only
its bearing is used for display, re-projected onto the *rendered* island's
waterline. Harbours were also built backwards — local `+X` pointed at the
island, putting warehouses on stilts at sea and berths against the rock.

### H2 — harbours read as distinct (`bf6e3dd`)

Each plan gets a sheltering arm of cut stone curving out from the quay, with a
lamp on the head. Two of the five plans get none, which distinguishes an open
roadstead from a sheltered basin.

### L6 — the Pharos (`22f8676`)

The "buggy text" was the dedication band: thirteen abstract gilt bars, one per
letter of ΘΕΟΙΣ ΣΩΤΗΡΣΙΝ, with 0.09-unit features on a 34-unit tower — under a
pixel at overview zoom, so it could only resolve as noise shaped like writing.
Replaced with a three-bay rosette frieze in relief, every feature ≥ 0.3 units.
Real letterforms were considered and rejected: thirteen legible Greek capitals
do not fit a 5.9-unit face.

For "not epic enough" the silhouette was missing its gallery. There is now a
projecting balustraded terrace at the square tier's head, on corbel brackets,
with the octagon set back and the four Tritons on its corner piers. Bounds and
anchors are untouched (34 units, beacon 30.1).

### H4 — the map (`22f8676`)

`PHAROSVILLE_MAP_SCALE` 2 → 2.5, so 140×140. A non-integer scale exposed four
assumptions that only held while the transform was a whole number — see the
commit message. The one worth internalising: **design-space coordinates are
tile indices, and the zone predicates test them inclusively.** Anything new
authored in design space must go through `zoneWorldTile` (edge-preserving,
integral) and read back through `designTileX/Y`, not a raw divide.

### S1 — the sea (`bf6e3dd`)

The region tint was the DEWS band accent pulled 0.5–0.62 toward one shared
anchor. The anchor stopped accents reading as paint, but pulling five hues
toward one point collapsed them. `ZONE_THEMES[terrain].base` was already the
theme bridge's water colour per terrain and already a naturalistic ramp, so no
anchor is needed. Depth (the value ramp) widened to 0.60–1.26, and the region
boundary is now a tide line plus a shadow rather than one faint bright line.

---

## Open decisions, not tasks

- **The p90 ≤ 20 ms reference gate is unmet on this machine.** It only runs
  under `PHAROSVILLE_REFERENCE_GATE=1`; normal CI uses 250 ms / 4 fps and
  passes. Shipping documented rather than by cutting features (operator
  decision O4).
- **The `constrained` tier drops the whole composer**, losing colour grading
  along with bloom. Grade is one cheap full-screen pass carrying the entire
  day/dusk/night identity, so the cliff costs far more than the pass does. Not
  changed unmeasured — `constrained` is the last-resort recovery valve.
- **Visual baselines are not regenerated** (O10 deferred them to the end). The
  visual lane is expected red until that pass runs via the Docker CI lane,
  then `chown` back. H4 and S1 both change every water pixel, so this is now a
  full regeneration rather than a touch-up.
- **Nothing is pushed.** Production is unchanged until the operator pushes.

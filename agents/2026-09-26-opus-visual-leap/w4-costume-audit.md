# W4.P2 — costume audit of the rest frame (`#t=12.25`, `#t=19.2`, `--clock 2026-09-26`, live data)

Rule (plan W4.P2, garden-master-7, art council 10): every cultural object does a job — **identity**,
**light** or **landing**; at most **one** such object per station readable at rest; kasuga/noren detail
only at close LOD.

Frames: `outputs/opus-review/printgate/h1-noon.png`, `h2-belt.png` (Print gate) and the wave captures
`outputs/opus-review/w4w6/PharosFinish/noon-c.png`, `belt.png` (after W4 siblings landed: the harbour
moon-window hall has left the frame and the flora swap changed the maples/islet pines — rows marked
"Print gate only" were seen there and must be re-checked if framing moves back).

## Per station

| Station | Readable cultural object(s) at rest | Job | Verdict |
| --- | --- | --- | --- |
| Threshold (seat, lower left) | stone tōrō on the bank | light (kindled, W0.9) | pass — the station's one object |
| Threshold (right edge) | nobori cloth | identity (K28) | pass |
| Pharos island | the tower | identity | pass (monument, not costume) |
| Pharos island | chaseki under the crag | rest at the path's end | **fixed** (PharosFinish): two-tier pyramid on four posts read as a parasol; now a walled hut under one low hipped roof, env ≤ 0.3. Job borderline — see item 4 |
| Pharos island | 2 path lanterns | light | pass; lamp box + cap, no kasuga detail at rest |
| Pharos island | landing stones + kutsunugi | landing | pass (torii gone, O6) |
| Pharos island | precinct gate + gatehouse light | landing / light | pass; stone darkened below the tower |
| Pharos island | lee plank jetty | landing | **fixed** (PharosFinish): dark timber drew a floating ink stroke; now sea-silvered planks |
| Pharos island | **signal mast, 0 pennants** | data (peg alerts) | **fail at rest**: bare pole + yard reads as a Christian cross beside the chaseki (`noon-c-island3x.png`, x≈910) |
| Left harbour (hall + tower) | open timber frame tower (red members) | none (landmark) | watch: red frame is a second red note after danger water/vermillion |
| Left harbour | nobori (BNB "B") | identity | pass |
| Left harbour, Print gate only | tsukimi moon window (torus + bars) on the hall | none | **fail**: second readable object at its station |
| Left harbour | stepped water stair with paired noren | none | not readable at rest — keep it close-LOD only |
| Fleet | stern chōchin (W4.F7) | light | pass; lit only after kindling |
| Fleet, near moorings | boats seen stern-on read as boxes (`h1-noon` x≈640–720, y≈600–690) | — | not costume; fleet-craft note |
| Harbour + far islet, Print gate only | maples / islet pines with flat orange pads | — (flora) | **fail G3b** there (parasol silhouettes); not seen in `noon-c` after the flora swap |

## Fixed in PharosFinish files

- `src/three/garden-island.ts` — chaseki silhouette (parasol → hut); jetty value; props env ≤ 0.3
  (chaseki, landing stones, lee jetty, quay stair treads/cheeks/foot stone).
- `src/three/garden-precinct.ts` — masonry/recess env ≤ 0.3; dry-laid stone a step darker than the tower.

## For the orchestrator (not in my files)

1. **Signal mast** (`src/three/garden-signal-mast.ts`, placed at `world-renderer.ts` `createGardenSignalMast`
   call, island (7.2, 0.98, 3.2)): with 0 pennants the pole + yard is a cross. Suggest hiding the yard (or
   striking it to a slanted gaff) when `pennantCount === 0 && !stormCone`; data unchanged.
2. **Moon window** (`src/three/garden-docks.ts` `pushFeatureGeometry(... TorusGeometry(0.95 ...))` on the
   hall's second level): no job; close-LOD only or delete.
3. **Harbour frame tower** (`src/three/garden-docks.ts` campanile block): keep only if it carries the
   station's identity; its red should drop to weathered timber so red stays reserved.
4. **Chaseki job**: for a strict identity/light/landing reading, hang the nearer path lantern
   (`ISLAND_LANTERN_POSITIONS[1]`, Harbour's kindling seam) under its eave so the hut becomes the light;
   otherwise accept "rest at the path's end" as the keeper implied by craft (§1.1 rule 7).

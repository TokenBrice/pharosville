# Wave 3b — Station archetypes and precinct bridge

## Contract

- Keep `authorDock` as a pure `DockRecipe` author and preserve the harbor
  batch's three runtime mutation APIs.
- Consume `dock.station?` structurally. Until the systems branch lands it,
  derive the station type from the existing authored harbor identity and the
  shore bearing from the island/display tiles.
- Replace the industrial dock vocabulary with eight shore-station recipes:
  one roofline, flag cut and signature per type; masonry health remains on
  quay stone and cracks.
- Author Ethereum-to-annex covered bridges into existing global timber/roof
  buckets. No per-station meshes; the complete harbor batch stays at or below
  20 drawables.

## Steps

1. Rewrite focused recipe tests around station-type silhouettes, supply scale,
   health masonry, defensive station fallback, facing, flags, and bridges.
2. Replace the old plan/enclosure/industry authoring with station recipe
   helpers and add only the instanced signature prop kinds that need their own
   shared material/geometry.
3. Teach the batch to merge precinct bridges and clip the one flag mesh into
   per-station shapes without changing atlas-cell semantics.
4. Include the optional station contract in the renderer's structural cache
   key and amend the harbor composition invariant in the same commit.
5. Run the requested focused tests and typecheck, then preview port 5213 at
   default, `#t=19`, and `#cam=0,0,0.28`; inspect frames and record the draw
   census in `outputs/swarm/station-archetypes-report.md`.

## Shed list

Industrial warehouses, crates, barrels, cranes, gantries, dry docks,
derricks, careening hard, slipways, enclosing breakwater vocabulary, and the
old per-chain hashed dockyard identities are displaced by the station forms.

# Lane ISLAND — exec notes (Wave 6 island part + 08-T3)

## Changelog bullets (user-facing)
- The west lobe is a cultivated hinterland now: contour olive terraces with dry-stone walls, a trellised vineyard down the slope, a threshing floor by the windmill, and the meadow scrub grows where the land would grow it (maquis on the steep flanks, garrigue on the ridges, open turf by the roads) instead of an even sprinkle.
- Umbrella pines come in three shapes (flat-tiered, wind-sheared on the crests and by the sea, young), and the grass dries to gold on ridges and south faces and stays lush in the hollows.
- Trees, vines, laundry and drying nets stir in the wind - a few centimetres, more in a storm; reduced motion holds them still.
- A small hill sanctuary on the west spine: a tholos in a ring of cypresses, an altar and two stelae, a zig-zag path up from the road, and one small lamp at dusk.
- The moles get a rhythm: darker paving bands under the lamps, amphora stacks, coiled hawsers and capstans, and a stone exedra at mid-length.
- Washing on the roof terraces, reed blinds on the pergolas, pot plants, and nets drying beside the net stores.
- The fields turn with the farm year: brown furrows in winter, green shoots in spring, gold in early summer, stubble with stooks after the harvest, ploughed again in autumn; the vineyard reddens in autumn.
- At night a few dim hearths glow in the hinterland: farm doors, the windmill, the sanctuary and two wayside lamps.

## Legend lines (decorative)
- Trees, vines and laundry sway: decorative; the wind they follow is the weather's (stress band), not a new signal.
- Fields and vineyard through the year: decorative (calendar).
- Hinterland hearths: decorative (time of day).

## Notes for integration
- New runtime surfaces: `world/sway.ts` (+ `uSwayK`), `PATTERN_CROP = 15` + `hbCrop()`/`hbGrassTerrain()` in `world/materials.ts`, light kind `hearth` (`lights/lights-service.ts`, `layout/types.ts`).
- `hbSwayGust(xz)` in `world/sway.ts` is the hook for the MOTION lane's shared gust field (returns 1 today).
- Island rebuild is reproducible from the worktree: occupancy.json reconstructed from layout capacity (`outputs/`), wreck cove kit raw GLBs from `wrecks/export.py --no-compress`, and `build_island.py` now tolerates the missing emblem atlas.

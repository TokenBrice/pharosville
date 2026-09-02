# Handover — Seven-Water Garden follow-ups (2026-09-02)

## State of the tree
- `main` at `86f358c`: Waves 0–8 executed and reviewed (see `agents/2026-09-02-grand-redesign-evaluation-and-plan.md` and the swarm reports under `outputs/swarm/*-report.md`, gitignored scratch). 1711 unit tests, typecheck, lint green; real-GPU default ≈235 calls / 43 textures / 60 fps.
- `release/v0.9.0` at `2347bec` was forked at `b230862` — it is STALE. Rebuild it from final `main` (branch -f, re-apply the three release records: `CHANGELOG.md`, `src/content/pharosville-changelog.ts`, `src/content/pharosville-version.ts`, then `npm run docs:runtime-facts`) per `docs/pharosville/RELEASES.md`. Never put version/changelog records on `main`.
- Last `validate:release` on `main` and the final scoped re-review (`ReReviewFinal`) were still running at handover — rerun `env -u CI npm run validate:release` first; the earlier run failed only on the deep-link visual test, fixed in `412e35a`.
- Rules: work on the main checkout; look/frame-time ONLY via `env -u CI npm run preview -- --url http://localhost:5173 ...` (never Playwright); `--draw-census` for owners; ≤700 calls / ≤72 textures / p95 ≤20 ms; every semantic cue keeps registry→detail→ledger→legend parity; decorative things are noted "carries no meaning". Rebuilt the wrapper needs `--full-access --yes-full-access` for codex agents.

## Operator feedback to fix (in this order)

### 1. Ships outside the water / off the plate (screenshots: ships on the background beyond the rim; a moored hull on the "paper"; a barge at the far edge)
Root-cause candidates, all in one path family:
- Transition endpoints: `gardenMistBoundaryTile` / arrival-departure paths in `src/three/world-renderer.ts` (~432–500). Commit `f54d1b6` routed them through the water-safety field, but the frames still show hulls beyond the rim on sides with NO opening → verify endpoints are constrained to the two `RIM_OPENINGS` arcs (`src/systems/garden-rim.ts`) AND inside the finite plate (`garden-water-contract.ts` plate extent), for every ship regardless of its nearest edge. Add a test: every arrival/departure/cross-map endpoint and every sampled point along the path is `isGardenShipWater(point, margin)` with the ship's family margin and lies within an opening arc.
- Moored/outsider hulls: `resolveGardenShipDisplayTile` skips the safety correction for moored/arriving/departing samples (`src/systems/garden-observatory-slice.ts` ~210–230). Stations sit on the rim coves; a berth composed past the plate edge must be rejected in `src/systems/pharosville-world/stages/dock-assignment.ts` (`isBerthTile`) — check the finite-plate bound (not just rim/map margins).
- The transient selected outsider (deep-link to a ship past capacity) and `selectGardenTransientShip`: ensure its display tile also passes the field.
- Verify with the dense fixture AND live data: iterate all ships each second for 10 min of world clock and assert `terrainKindAt`/`rimLandAt` never land; plus a preview at `#cam=980.1,63.4,400.5#t=20.5` (the operator's framing) and `#cam=0,0,0.28`.

### 2. Harbor (station) models too simple / unreadable at distance
Files: `src/three/garden-docks.ts` (`authorDock` recipes, station archetypes), `src/three/garden-harbor-batch.ts` (buckets/props), `docs/pharosville/VISUAL_INVARIANTS.md` (harbor contract).
- Each of the 10 station types must have a silhouette that reads at the default view height (~100 world units): bigger primary roof mass (≥6×4 footprint, ≥3 units high for precinct/boathouse; ≥4×3 / ≥2.2 others), a second-level element (bell tower for Ethereum, torii-like gate for gate-landing, thatched dome for reed-boathouse, lantern tower for storm-mole, mast for signal-jetty), stone quay platform with a visible lit edge, warm window emissives at dusk/night (ember budget), and the chain flag scaled ×1.6. Keep ≤20 ring draws (extend buckets, not meshes). Precinct bridges: thicker deck + railings so ETH↔L2 reads as one place.
- Gate: at `#cam=<eth cove>,1.0` and default, each type is nameable from silhouette; `--draw-census` ring rows ≤20.

### 3. Night too dark; lighthouse beam too small
Files: `src/three/garden-day-cycle.ts`, `garden-post.ts` (night grade/LUT via `scripts/pharosville/generate-garden-luts.mjs`), `garden-sky.ts` (night backdrop), `garden-lighthouse.ts` (beam cone), `garden-lanterns.ts` (ember gain), `src/systems/palette.ts`.
- Lift the night floor: raise night key/fill so hulls and the rim read (target: island + rim silhouettes visible in a 16-px blur, water not black); keep the hierarchy contract — beacon dominant, moon road secondary, embers subordinate (`VISUAL_INVARIANTS` Stillness). Regenerate the night LUT (`--check`), keep open-water mean-emissive ≤0.016 test meaningful.
- Beam: lengthen/widen the cone (`garden-lighthouse.ts` beam geometry/uniforms and the sweep in `world-renderer.ts` ~3810+) so it reaches the rim (~90 units), with a soft volumetric falloff and a visible light pool on the water where it lands (reuse the lane/light-road terms in `garden-water.ts`); keep it the one dominant light.
- Gate: `#t=22&n=1` frame + `--assert` PASS; `--assert --reduced` PASS.

### 4. Sea zones still hard to tell apart
Files: `src/three/garden-water.ts` (region terms), `src/systems/garden-sea-regions.ts` (`SEA_REGION_CHARACTER`), `src/three/garden-sea-edges.ts` / `src/systems/garden-sea-edge-sites.ts`, `src/three/garden-sea-signs.ts` (steles).
- Push hue/character further while keeping value tracking depth: calm = jade mirror; watch = teal long ripples; alert = grey-green current streaks (stronger, aligned); warning = pale shelf + broken foam; danger = indigo, steep foam; ledger = slate flat striations; wreck = silt. Add a low-frequency per-body boundary treatment (banks/foam seam a few tiles wide) so borders read at distance, and enlarge the sea-edge geography (tongues, bars, piles) ~1.5× with lighter stone values.
- Steles: default weight was made quiet; give them a legible carved name at default zoom (not only on hover) — the operator wants zones recognizable.
- Gate: name all seven bodies from a `signs=0` frame at default AND whole-map; night budget test intact.

### 5. Cemetery replaced by a random wreck model
File: `src/three/garden-landmarks.ts` (wreck cemetery; `1dd8646` silhouettes), `src/systems/world-layout.ts` (`CEMETERY_CENTER`), Wreck Shoal area.
- The Wreck Shoal today shows a few large stylised hull ribs (blue/orange/red) that read as one random model. Required: a legible **graveyard**: 5–7 small half-sunk hulls at the water line, grey/bleached (cause colour only as a small marker/stain, never the whole hull), scattered spars, a still silt pool, a low stone marker per grave; scale each wreck to its grave's `scale` but cap so none dwarfs the fleet; sink 60–80 % below the waterline. Keep ≤3 instanced draws, deterministic per grave id, cause silhouettes (substantial / broken-keel / bare-remains), DOM parity (detail + ledger unchanged), and the registry text from `1dd8646`.
- Gate: at default and `#cam=<wreck>,1.0` it reads as a quiet wreckyard, not a hero model.

## Process
- One agent per item (Sol for 2/3/4/5, Sol medium for 1), sequentially on `main` with focused tests, then `npm test -- src`, typecheck, lint, `validate:release`; commit per item in the repo's voice.
- Then rebuild `release/v0.9.0` from final main as above.

## Resolution (2026-09-02, later)
- Items 1–5 landed on `main` as one commit each (`2f71ce2`, `68ac412`, `0ab7939`, `d64b2c9`, `764074d`, docs `bee54f3`), plus `328a249`: removing the moored exemption made every corrected hull run the radial nearest-water search per frame (draw submit 8 → 12.9 ms, 30 fps); the resolver now reuses the last correction vector while the source stays within a tile. Real-GPU `--assert` back at p95 16.8 ms / draw submit 2.2 ms, 247 calls, 42 textures.
- Live-data audit (185 ships, 601 s of world clock, 111k slice samples): no hull on rim/terrain land or off the plate. Script: `outputs/live-hull-audit.mts` (scratch).
- Follow-ups found, not fixed:
  - Moored display composition: a representative hull's moored tile is `mooringTile + displayOffset`, not the mooring. With blue-noise berths ~100 tiles from the data tile this put moored hulls on the paper (the operator's screenshot); item 1 now resolves them to the nearest safe water, which keeps them on the plate but not at their dock. The garden needs its own moored anchor (dock display berth), not the data-space delta.
  - Deep link to a moored ship before the first motion sample: `focusSelectedCamera` resolves the tile with an empty sample map, so it frames the no-sample tile, which differs from the moored one by the mooring delta. Visible on `usde-ethena`/`susde-ethena` (dense fixture): the visual deep-link test now pins `busd0-usual`.
  - A few ships render an iridescent sail/hull (near the Ethereum precinct and Wreck Shoal); pre-existing, ship-side, not harbor materials.

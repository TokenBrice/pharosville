# PharosVille Architecture

Last updated: 2026-10-15

PharosVille is The Harbour: a desktop-gated React shell around one imperative
three.js WebGL2 world (`src/harbour/`). Every stablecoin is one boat sailing a
circuit between its chains' piers, docking longest where it holds the most
supply; the lighthouse beam is the Pharos Stability Index; sea state, weather
and fog carry off-peg share, stress signals and stale data. The world carries
the meaning; text appears only on demand (hover tag, side panel, ledger).
Decisions D1-D14 live in `agents/2026-10-13-pharosville-reboot/PLAN.md`.
Since v1.2.0 the town, civic buildings and fleet share the Pharos's era (a
Ptolemaic Mediterranean harbour, ancient hulls); that restyle changed art only,
no data mapping (`agents/2026-10-15-classical-town/PLAN.md`). The civic and
hull GLB node names the runtime relies on are checked by
`npm run check:harbour-contracts`.

## Request and loading boundary

```text
Browser → /api/<allowlisted read path> → Pages Function → PHAROS_API_BASE
```

The gate in `src/client.tsx` admits only the 720×600 size profile
(`src/systems/viewport-gate.ts`; desktops, laptops, unfolded foldables, tablets), on the physical screen and on the current
window, before it lazy-imports `src/harbour/app/harbour-app.tsx`. Dimensions
are sorted; these are SIZE tests, never orientation tests. A blocked viewport
gets the static welcome page and never loads three.js, GLBs, logos or world
data. The Pages Function alone reads `PHAROS_API_KEY`; browser code calls
same-origin `/api/*` only.

## First paint

`index.html` paints a full-window poster (`public/harbour/poster-*.{avif,webp}`,
an illustration with no live numbers) outside the React root, with the arrival
card from `public/arrival-shell.css`. `HarbourApp` builds the Engine, waits for
the first rendered frame and the first stablecoin payload (8 s at most), lets
the fleet settle for a few frames, then crossfades the poster into the live
canvas. If WebGL2 cannot start, the poster stays up with the guide and links.
The shell has no inline script, so the CSP pins no script hash.

## Runtime pipeline

```text
HarbourFeed (/api/*, per-endpoint cadence) → buildHarbourModel → HarbourSim
  → Engine frame: systems update in registration order → post chain → canvas
  → overlay UI (React root in src/harbour/ui/) reads services, never the scene
```

- `engine/`: `Engine` (renderer, scene, perspective camera on the bounded
  `CameraRig`, `TimeOfDay`, `AssetStore`, pmndrs `PostChain` with bloom, AgX
  and SMAA, `QualityGovernor` for the pixel ratio) and the shared
  `WorldUniforms`. Systems implement `WorldSystem` and expose services through
  `ctx.services`.
- `systems.ts`: the ordered registry. Layout, data, readings, sky, ocean,
  island, lighthouse, fleet, lights, beam.
- `data/`, `model/`, `sim/`: the same-origin feed (last good payload per
  endpoint, freshness from `_meta` and headers), the pure model (coins, piers,
  truth states, readings) and the deterministic circuit sim (boat poses at
  time t).
- `readings/`: binds PSI, off-peg share, DEWS and staleness to the beam, sea
  state, storm cones, tide gauge and fog.
- `sky/`, `ocean/`, `world/`, `fleet/`, `lights/`, `beam/`: the picture, from
  `public/harbour/` assets (island and lighthouse GLBs, boat kit, sea SDF,
  emblem atlas).
- `ui/`: the chart-paper overlay (corner mark, hover tag, side panel, ledger,
  search, chart labels) on its own React root, mounted by `ui/mount.tsx`.
- `app/`: the production mount and the poster crossfade. `harbour.html` +
  `main.ts` are the dev-only standalone entry.

## Contracts and budgets

Bundle caps are enforced by `npm run check:bundle-size`
(`scripts/bundle-budgets.mjs`) and listed in `RUNTIME_FACTS.md`. Frame time and
looks are judged only on the real GPU with `npm run preview`
(`scripts/harbour/shot.mjs`); see `TESTING.md`.

## Validation

```bash
npx vitest run src/harbour
npm test
npm run check:viewport-gate
npm run validate:docs
npm run test:visual
npm run preview -- --url http://localhost:5173/
```

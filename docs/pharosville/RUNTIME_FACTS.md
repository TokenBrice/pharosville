# PharosVille Runtime Facts

Generated from repository source. Do not edit by hand.

Regenerate with `npm run docs:runtime-facts`; verify with `npm run check:runtime-facts`.

## App And Routes

- Canonical app URL: `https://pharosville.pharos.watch/`
- World: The Harbour, one three.js WebGL2 Engine (`src/harbour/engine/`) mounted by `src/harbour/app/harbour-app.tsx`
- Renderer failure fallback: the first-paint poster stays up with the arrival guide and Pharos links; no alternate renderer
- Runtime media namespace: `/harbour/`
- Latest app version: `v1.2.1` (`canvasUp`)
- Latest changelog entry: `2026-10-19-canvas-up` / `v1.2.1` / 2026-10-19 / Canvas Up

## Viewport Gate

- Size profile: `720×600px` (long side × short side)
- Device capability and current-viewport readiness independently sort their own dimensions and must satisfy that profile. It admits desktop and laptop windows, unfolded foldables and tablets either way up; phones and folded foldables get the welcome page.
- Orientation and aspect ratio are not gates: an 832×680 unfolded foldable, a 744×1133 portrait tablet, a 1200×640 laptop viewport, and a 2560×720 ultrawide viewport all pass.
- `src/client.tsx` lazy-loads the Harbour chunk (`src/harbour/app/harbour-app.tsx`: Engine, systems, data feed) only after that gate; `npm run check:viewport-gate` guards the boundary.

## API Allowlist

- `/api/stablecoins`
- `/api/chains`
- `/api/stability-index?detail=true`
- `/api/peg-summary`
- `/api/stress-signals`
- `/api/safety-grades`
- `/api/mint-burn-flows`

## Runtime Media

- Stablecoin emblems: one atlas, `/harbour/emblems.avif` (`/harbour/emblems.webp` when AVIF fails) + `/harbour/emblems.json`; panel and search medallions load same-origin `/logos/` and `/chains/` marks.
- Chain crests: one atlas, `/harbour/crests.webp` (lossless) + `/harbour/crests.json`, decoded once for the office crests and the movers' flags.
- Static world GLB: `/harbour/island.glb`
- Static world GLB: `/harbour/lighthouse.glb`
- Boat hull kit: `/harbour/kit/manifest.json` and its GLBs; sea mask: `/harbour/sea-sdf.webp` (lossless); shipped GLBs are fetched as pre-gzipped `.glb.gz`.
- First paint: `/harbour/poster-{960,1600}.{avif,webp}` (an illustration, no live numbers), crossfaded into the first live frame.

## World Systems

- Registration (= update) order: `SeasonSystem` → `LayoutSystem` → `DataSystem` → `ReadingsSystem` → `WeatherSystem` → `SkySystem` → `OceanSystem` → `IslandSystem` → `LighthouseSystem` → `CivicSystem` → `FleetSystem` → `LifeSystem` → `IdentitySystem` → `LightsSystem` → `BeamSystem`

## Bundle Budgets

- entry chunk: raw <= 64 KiB, gzip <= 24 KiB
- Harbour lazy chunk: raw <= 1,020 KiB, gzip <= 352 KiB
- Three.js renderer chunk: raw <= 960 KiB, gzip <= 276 KiB
- Harbour CSS: raw <= 28 KiB, gzip <= 7 KiB
- Total JS: raw <= 2,260 KiB, gzip <= 724 KiB

## Workflow Gates

- Deploy workflow jobs: `validate`, `visual`, `deploy`
- Canary smoke cron: `23 7 * * *`
- GitHub Release publication follows successful `Deploy to Cloudflare Pages` runs on `main`
- GitHub Release audit cron: `17 5 * * *`


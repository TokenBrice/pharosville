# PharosVille Runtime Facts

Generated from repository source. Do not edit by hand.

Regenerate with `npm run docs:runtime-facts`; verify with `npm run check:runtime-facts`.

## App And Routes

- Canonical app URL: `https://pharosville.pharos.watch/`
- World: The Harbour, one three.js WebGL2 Engine (`src/harbour/engine/`) mounted by `src/harbour/app/harbour-app.tsx`
- Renderer failure fallback: the first-paint poster stays up with the arrival guide and Pharos links; no alternate renderer
- Runtime media namespace: `/harbour/`
- Latest app version: `v1.4.0` (`livingHarbour`)
- Latest changelog entry: `2026-10-24-living-harbour` / `v1.4.0` / 2026-10-24 / Living Harbour

## Viewport Gate

- Size profile: `720×600px` (long side × short side)
- Device capability and current-viewport readiness independently sort their own dimensions and must satisfy that profile. It admits desktop and laptop windows, unfolded foldables and tablets either way up; phones and folded foldables get the welcome page.
- Orientation and aspect ratio are not gates: an 832×680 unfolded foldable, a 744×1133 portrait tablet, a 1200×640 laptop viewport, and a 2560×720 ultrawide viewport all pass.
- `src/main.tsx` evaluates the gate before importing React; only an admitted viewport imports `src/harbour/app/react-entry.tsx` and, through `src/client.tsx`, lazy-loads the Harbour chunk (`src/harbour/app/harbour-app.tsx`: Engine, systems, data feed); `npm run check:viewport-gate` guards the boundary.

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
- Boat hull kit: `/harbour/kit/manifest.json` and its GLBs; sea mask: `/harbour/sea-sdf.webp` (lossless, shipped as an exact planar-delta transport). Production builds publish first-view media under content-hashed `/harbour/_immutable/` paths (`scripts/harbour/build-asset-registry.mjs`): eager kit and civic GLBs in two indexed packs, Brotli-encoded over HTTP, cached immutable, with the previous release's files retained.
- First paint: `/harbour/poster-{960,1600}.{avif,webp}` (an illustration, no live numbers), crossfaded into the first live frame.

## World Systems

- Registration (= update) order: `SeasonSystem` → `LayoutSystem` → `DataSystem` → `ReadingsSystem` → `WeatherSystem` → `SkySystem` → `OceanSystem` → `IslandSystem` → `LighthouseSystem` → `CivicSystem` → `FleetSystem` → `LazyLifeSystem` → `LazyIdentitySystem` → `OfficeWorksSystem` → `MomentsStage` → `LightsSystem` → `BeamSystem`

## Bundle Budgets

- entry chunk: raw <= 10 KiB, gzip <= 4 KiB
- Harbour lazy chunk: raw <= 986 KiB, gzip <= 336 KiB
- Three.js renderer chunk: raw <= 960 KiB, gzip <= 276 KiB
- Harbour CSS: raw <= 34 KiB, gzip <= 9 KiB
- Total JS: raw <= 2,650 KiB, gzip <= 852 KiB

## Workflow Gates

- Deploy workflow jobs: `validate`, `visual`, `deploy`
- Canary smoke cron: `23 7 * * *`
- GitHub Release publication follows successful `Deploy to Cloudflare Pages` runs on `main`
- GitHub Release audit cron: `17 5 * * *`


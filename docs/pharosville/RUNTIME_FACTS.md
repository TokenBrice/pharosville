# PharosVille Runtime Facts

Generated from repository source. Do not edit by hand.

Regenerate with `npm run docs:runtime-facts`; verify with `npm run check:runtime-facts`.

## App And Routes

- Canonical app URL: `https://pharosville.pharos.watch/`
- Renderer: one production Three.js/WebGL renderer
- GPU or renderer failure fallback: interactive DOM signal overview; no alternate 2D renderer
- Runtime model namespace: `/pharosville/models/`
- Latest app version: `v0.17.0` (`reborn`)
- Latest changelog entry: `2026-09-08-reborn` / `v0.17.0` / 2026-09-08 / Reborn

## Viewport Gate

- Standard profile: `900×720px`
- Wide-laptop profile: `1200×640px`
- Device capability and current-viewport readiness independently sort their own dimensions and must satisfy either size profile.
- Orientation and aspect ratio are not gates: a 720×1000 tall viewport, a 1200×640 laptop viewport, and a 2560×720 ultrawide viewport all pass.
- `src/client.tsx` lazy-loads the desktop data and Three.js runtime only after that gate; `npm run check:viewport-gate` guards the boundary.

## API Allowlist

- `/api/stablecoins`
- `/api/chains`
- `/api/stability-index?detail=true`
- `/api/peg-summary`
- `/api/stress-signals`
- `/api/report-cards`
- `/api/mint-burn-flows`

## Runtime Media

- Stablecoin sails and rendered-harbor flags load same-origin logo images into shared in-memory atlases with deterministic mark fallbacks.
- Ship, dock, island, cemetery, ambient-life, and water visuals are renderer-owned procedural geometry/materials.
- Water normal: `/pharosville/textures/water-normals.png` with a content-hash query.

| Model | URL | Bytes | Geometry | SHA-256 |
| --- | --- | --- | --- | --- |
| `garden-lighthouse-shell` | `/pharosville/models/garden-lighthouse-shell.glb` | 227 KiB | 7 draws / 37,160 tris / 24,304 verts / 0 textures | `683bcbcac8ccd18f9f6b6237931f5011600e1d87088507dab912aca1fd39b9c9` |
| `garden-hero-tether` | `/pharosville/models/garden-hero-tether.glb` | 20 KiB | 4 draws / 930 tris / 842 verts / 0 textures | `fd98b1089c306898bf300a53169b4b1d3183f9038fce174dac5a2f4e37013e55` |
| `garden-hero-circle` | `/pharosville/models/garden-hero-circle.glb` | 28 KiB | 5 draws / 1,258 tris / 1,392 verts / 0 textures | `4f1a9e6f4b2d8db04d4368ad2be3e2c6d114b686335b33ac2b58a35fa606842d` |
| `garden-hero-maker` | `/pharosville/models/garden-hero-maker.glb` | 31 KiB | 5 draws / 1,764 tris / 1,451 verts / 0 textures | `fc0a62b0acc422aa713f18658af2d0d49dba3703bec8be97e30ab496cc52c52b` |
| `garden-hero-sky` | `/pharosville/models/garden-hero-sky.glb` | 34 KiB | 5 draws / 1,904 tris / 1,707 verts / 0 textures | `0301094e72b79623dbbbb26d22458dc0e9a629bb5a1c5ebcff9d27b830426823` |
| `garden-hero-ethena` | `/pharosville/models/garden-hero-ethena.glb` | 28 KiB | 5 draws / 1,286 tris / 1,341 verts / 0 textures | `b4fcf32ac216e5a08b770ef04b31ad706c87c4b717a3ce95dfaef91e05f21d82` |
| `garden-hero-liberty` | `/pharosville/models/garden-hero-liberty.glb` | 20 KiB | 4 draws / 930 tris / 842 verts / 0 textures | `db9783ef4d2114386e8c3d6b278bf49c3d6b3eeb4f3c8c7abbc1a52585da1972` |
| `garden-hero-paypal` | `/pharosville/models/garden-hero-paypal.glb` | 24 KiB | 5 draws / 1,074 tris / 1,060 verts / 0 textures | `764c6b2666b0b9c61316a49b62990c5fa9470e87c4dbf80313ddb54687905529` |
| `garden-hero-bullion` | `/pharosville/models/garden-hero-bullion.glb` | 24 KiB | 5 draws / 1,092 tris / 946 verts / 0 textures | `1ff959496ad568b00da78728f56cee9dc5c3232c288a1680eff4d873141cb3e3` |

- The procedural lighthouse shell remains the in-scene fallback if its GLB cannot load.

## Bundle Budgets

- entry chunk: raw <= 300 KiB, gzip <= 90 KiB
- desktop lazy chunk: raw <= 1,024 KiB, gzip <= 290 KiB
- world lazy chunk: raw <= 440 KiB, gzip <= 145 KiB
- Three.js renderer chunk: raw <= 1,600 KiB, gzip <= 454 KiB
- entry CSS: raw <= 40 KiB, gzip <= 8 KiB
- Total JS: raw <= 3,200 KiB, gzip <= 886 KiB

## Squads

| Squad | Flagship | Members |
| --- | --- | --- |
| Sky | `usds-sky` | `usds-sky`, `stusds-sky`, `susds-sky` |
| Maker | `dai-makerdao` | `dai-makerdao`, `sdai-sky` |
| Ethena | `usde-ethena` | `usde-ethena`, `susde-ethena` |

## Titan Ships

| Stablecoin ID | Scale |
| --- | --- |

## Heritage Hulls

| Stablecoin ID | Scale |
| --- | --- |
| `bold-liquity` | `1.23` |
| `crvusd-curve` | `1.28` |
| `fxusd-f-x-protocol` | `1.23` |
| `m-m0` | `1.24` |
| `paxg-paxos` | `1.32` |
| `rlusd-ripple` | `1.28` |
| `susdai-usd-ai` | `1.21` |
| `u-united-stables` | `1.24` |
| `usd0-usual` | `1.22` |
| `usdai-usd-ai` | `1.23` |
| `usdd-tron-dao-reserve` | `1.26` |
| `usdf-falcon` | `1.3` |
| `usdg-paxos` | `1.28` |
| `usdtb-ethena` | `1.25` |
| `usdy-ondo-finance` | `1.27` |
| `usyc-hashnote` | `1.2` |
| `xaut-tether` | `1.28` |

## Dock Rules

- Standard chain harbor cap: `8`
- Preferred chain IDs: `ethereum`, `base`, `tron`, `solana`, `hyperliquid`, `polygon`, `bsc`, `arbitrum`, `ton`
- Suppressed rendered harbor IDs: `optimism`
- Detached dispatch wharf chain IDs: `ton`

## Workflow Gates

- Deploy workflow jobs: `validate`, `visual`, `deploy`
- Canary smoke cron: `*/30 * * * *`
- GitHub Release publication follows successful `Deploy to Cloudflare Pages` runs on `main`
- GitHub Release audit cron: `17 5 * * *`


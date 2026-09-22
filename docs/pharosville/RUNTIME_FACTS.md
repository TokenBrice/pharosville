# PharosVille Runtime Facts

Generated from repository source. Do not edit by hand.

Regenerate with `npm run docs:runtime-facts`; verify with `npm run check:runtime-facts`.

## App And Routes

- Canonical app URL: `https://pharosville.pharos.watch/`
- Renderer: one production Three.js/WebGL renderer
- GPU or renderer failure fallback: interactive DOM signal overview; no alternate 2D renderer
- Runtime model namespace: `/pharosville/models/`
- Latest app version: `v0.17.1` (`dyedCloth`)
- Latest changelog entry: `2026-09-10-dyed-cloth` / `v0.17.1` / 2026-09-10 / Dyed Cloth

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
- `/api/safety-grades`
- `/api/mint-burn-flows`

## Runtime Media

- Stablecoin sails and rendered-harbor flags load same-origin logo images into shared in-memory atlases with deterministic mark fallbacks.
- Ship, dock, island, cemetery, ambient-life, and water visuals are renderer-owned procedural geometry/materials.
- Water normal: `/pharosville/textures/water-normals.png` with a content-hash query.

| Model | URL | Bytes | Geometry | SHA-256 |
| --- | --- | --- | --- | --- |
| `garden-lighthouse-shell` | `/pharosville/models/garden-lighthouse-shell.glb` | 227 KiB | 7 draws / 37,160 tris / 24,304 verts / 0 textures | `4b163617fd5e75613b4a44d86de55f7f5fb6cb58d504cb89f25556f69b8d0d34` |
| `garden-hero-tether` | `/pharosville/models/garden-hero-tether.glb` | 20 KiB | 4 draws / 930 tris / 842 verts / 0 textures | `d8b66430e8c05b5d66d6c83f443697691141d74fa3f2027b29139b6bc12245ef` |
| `garden-hero-circle` | `/pharosville/models/garden-hero-circle.glb` | 28 KiB | 5 draws / 1,258 tris / 1,392 verts / 0 textures | `2e5e50cdd5e1fb137abb2f6715ba0970ae8ae536313d6b23d3034e8577ed5851` |
| `garden-hero-maker` | `/pharosville/models/garden-hero-maker.glb` | 31 KiB | 5 draws / 1,764 tris / 1,451 verts / 0 textures | `4998bb3c019e629cbecab19946ae28b83aedbc087310f9f570a9a5388956f20f` |
| `garden-hero-sky` | `/pharosville/models/garden-hero-sky.glb` | 34 KiB | 5 draws / 1,904 tris / 1,707 verts / 0 textures | `1083ae6633e2a4789bf75a0d50f45d0c14fa8b11c2a3e95efb0de666b35ffd54` |
| `garden-hero-ethena` | `/pharosville/models/garden-hero-ethena.glb` | 28 KiB | 5 draws / 1,286 tris / 1,341 verts / 0 textures | `a6cf8aa95fb5d9ff6eef3dcf804592bbc6af55c0ae0780ca4ca3406cb8da383f` |
| `garden-hero-liberty` | `/pharosville/models/garden-hero-liberty.glb` | 20 KiB | 4 draws / 930 tris / 842 verts / 0 textures | `ec8e689b2ad6b0821fa85488be042f124af42b572f296546857084ddc4f77eef` |
| `garden-hero-paypal` | `/pharosville/models/garden-hero-paypal.glb` | 24 KiB | 5 draws / 1,074 tris / 1,060 verts / 0 textures | `6dd7594730e6f509d9da975846667cbcdf67241ae3b54a61ed73b799c597f79d` |
| `garden-hero-bullion` | `/pharosville/models/garden-hero-bullion.glb` | 24 KiB | 5 draws / 1,092 tris / 946 verts / 0 textures | `f0e70a7c80fe57b346115259269997d1e292b7d88233b00b4b1f3e41ccd24ed4` |

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


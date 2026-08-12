# PharosVille Runtime Facts

Generated from repository source. Do not edit by hand.

Regenerate with `npm run docs:runtime-facts`; verify with `npm run check:runtime-facts`.

## App And Routes

- Canonical app URL: `https://pharosville.pharos.watch/`
- Renderer: one production Three.js/WebGL renderer
- GPU or renderer failure fallback: interactive DOM signal overview; no alternate 2D renderer
- Runtime model namespace: `/pharosville/models/`
- Latest app version: `v0.7.1` (`roomierHarbor`)
- Latest changelog entry: `2026-08-12-roomier-harbor` / `v0.7.1` / 2026-08-12 / Roomier Harbor

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
| `garden-lighthouse-shell` | `/pharosville/models/garden-lighthouse-shell.glb` | 203 KiB | 7 draws / 33,444 tris / 21,642 verts / 0 textures | `1b2fa7dcc436fb900038079ee178d8630359a8c9351c7a77497b1f82be8d6973` |
| `garden-hero-titan` | `/pharosville/models/garden-hero-titan.glb` | 60 KiB | 5 draws / 3,326 tris / 4,158 verts / 0 textures | `38f25ef8d009a0ae060afa83abe7100de364f2327266872170d813ed8830fdbe` |
| `garden-hero-heritage` | `/pharosville/models/garden-hero-heritage.glb` | 50 KiB | 5 draws / 2,680 tris / 3,293 verts / 0 textures | `8b5dd6a3b8e81855cc2044a7b80e6f91cbcc2c7b886a60e1f0d4e1075b7974a9` |
| `garden-hero-carrack` | `/pharosville/models/garden-hero-carrack.glb` | 61 KiB | 5 draws / 3,264 tris / 4,198 verts / 0 textures | `ea0ade2fcf899e966e2c1a5542dd09d3f57ec12e22b84d9f95c10617a7713852` |
| `garden-hero-brigantine` | `/pharosville/models/garden-hero-brigantine.glb` | 41 KiB | 5 draws / 2,150 tris / 2,499 verts / 0 textures | `a298ced1269ef3b7d8f2c34a994405faed1dcdd4799b6759e5ea8264d8d7e44f` |
| `garden-hero-dhow` | `/pharosville/models/garden-hero-dhow.glb` | 42 KiB | 5 draws / 2,094 tris / 2,592 verts / 0 textures | `568ade645855ae7ba470d5f7d0ce7a08aff22686844c30d2836390d501b17fbc` |
| `garden-hero-junk` | `/pharosville/models/garden-hero-junk.glb` | 43 KiB | 5 draws / 2,264 tris / 2,695 verts / 0 textures | `8475fc2b44efaeb7518f136ef1f4e81c1b4213dfef7852c908676a8c833ec7fd` |
| `garden-hero-barquentine` | `/pharosville/models/garden-hero-barquentine.glb` | 50 KiB | 5 draws / 2,724 tris / 3,228 verts / 0 textures | `d4d226305fa7bb2b19774fb0b01c9f25fb01bc26767795479db3f7698782188a` |
| `garden-hero-cog` | `/pharosville/models/garden-hero-cog.glb` | 44 KiB | 5 draws / 2,188 tris / 2,786 verts / 0 textures | `8001c31e9f9a8e4fe501376c374206a34a15b8be9f7bb9ca26287e80b59f9183` |
| `garden-hero-xebec` | `/pharosville/models/garden-hero-xebec.glb` | 48 KiB | 5 draws / 2,486 tris / 3,078 verts / 0 textures | `c306130a5cb84d657ef3d1f6bedd2c2dec5d14bd34bad1ca486c1aaf81dda4da` |
| `garden-hero-cutter` | `/pharosville/models/garden-hero-cutter.glb` | 42 KiB | 5 draws / 2,064 tris / 2,585 verts / 0 textures | `9ca8d7a77d010140d5e28d16515184d80319b977cc4196a1b95de23f93d0d0f0` |
| `garden-hero-tether` | `/pharosville/models/garden-hero-tether.glb` | 69 KiB | 5 draws / 3,694 tris / 5,106 verts / 0 textures | `839c9c9c5807cbe5496afbe2e27616e1b1abfb64e72a793661b1c3756e97423c` |
| `garden-hero-circle` | `/pharosville/models/garden-hero-circle.glb` | 60 KiB | 5 draws / 3,328 tris / 4,265 verts / 0 textures | `674a69db1d998315a46ace1702e09cb9ddb557f7abd71b2be371188d1a4a5400` |
| `garden-hero-maker` | `/pharosville/models/garden-hero-maker.glb` | 50 KiB | 5 draws / 2,682 tris / 3,349 verts / 0 textures | `d35b89906aadec5c0ece2e38da6b58b77e550043394f43d811d6e49a32642d45` |
| `garden-hero-sky` | `/pharosville/models/garden-hero-sky.glb` | 53 KiB | 5 draws / 2,926 tris / 3,570 verts / 0 textures | `f36ed3f81fbfce75796a3a6a576a26fa363558e4b287579831c79981b30da8dd` |
| `garden-hero-ethena` | `/pharosville/models/garden-hero-ethena.glb` | 46 KiB | 5 draws / 2,794 tris / 2,714 verts / 0 textures | `7c511cd51eff7f6e84d06232b686de5518179b32b066ef7b77a1fc1b84053bca` |
| `garden-hero-liberty` | `/pharosville/models/garden-hero-liberty.glb` | 56 KiB | 5 draws / 2,830 tris / 3,901 verts / 0 textures | `6a4b34d6e50ec6eb47dd8abb37076e0fb5f3724695776de4ab058fc384491c1d` |
| `garden-hero-paypal` | `/pharosville/models/garden-hero-paypal.glb` | 50 KiB | 5 draws / 2,658 tris / 3,250 verts / 0 textures | `c0de8fc34e039f5c2f448617fac7893c1b83f3965739d239811c478a8b01d5d1` |
| `garden-hero-bullion` | `/pharosville/models/garden-hero-bullion.glb` | 40 KiB | 5 draws / 2,106 tris / 2,495 verts / 0 textures | `c0f7a5cd370e4d57ef20c1317e8478a6f08eba0e029cd6564103964434aa79c6` |

- The procedural lighthouse shell remains the in-scene fallback if its GLB cannot load.

## Bundle Budgets

- entry chunk: raw <= 300 KiB, gzip <= 90 KiB
- desktop lazy chunk: raw <= 1,024 KiB, gzip <= 290 KiB
- world lazy chunk: raw <= 440 KiB, gzip <= 145 KiB
- Three.js renderer chunk: raw <= 1,600 KiB, gzip <= 454 KiB
- entry CSS: raw <= 36 KiB, gzip <= 8 KiB
- Total JS: raw <= 3,200 KiB, gzip <= 820 KiB

## Squads

| Squad | Flagship | Members |
| --- | --- | --- |
| Sky | `usds-sky` | `usds-sky`, `stusds-sky`, `susds-sky` |
| Maker | `dai-makerdao` | `dai-makerdao`, `sdai-sky` |
| Ethena | `usde-ethena` | `usde-ethena`, `susde-ethena` |

## Titan Ships

| Stablecoin ID | Scale |
| --- | --- |
| `buidl-blackrock` | `1.4` |
| `dai-makerdao` | `1.06` |
| `pyusd-paypal` | `1.4` |
| `sdai-sky` | `0.94` |
| `stusds-sky` | `0.98` |
| `susde-ethena` | `0.95` |
| `susds-sky` | `0.94` |
| `usd1-world-liberty-financial` | `1.35` |
| `usdc-circle` | `1.53` |
| `usde-ethena` | `1.2` |
| `usds-sky` | `1.15` |
| `usdt-tether` | `1.7` |

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
- Preferred chain IDs: `ethereum`, `base`, `arbitrum`, `polygon`, `bsc`, `tron`, `solana`, `hyperliquid`, `aptos`, `avalanche`
- Suppressed rendered harbor IDs: `optimism`
- Detached dispatch wharf chain IDs: `ton`

## Workflow Gates

- Deploy workflow jobs: `typecheck`, `lint`, `unit`, `guards`, `build`, `visual`, `visual-cross-browser`, `deploy`
- Canary smoke cron: `*/30 * * * *`
- GitHub Release publication follows successful `Deploy to Cloudflare Pages` runs on `main`
- GitHub Release audit cron: `17 5 * * *`


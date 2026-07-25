# PharosVille Runtime Facts

Generated from repository source. Do not edit by hand.

Regenerate with `npm run docs:runtime-facts`; verify with `npm run check:runtime-facts`.

## App And Routes

- Canonical app URL: `https://pharosville.pharos.watch/`
- Renderer: one production Three.js/WebGL renderer
- GPU or renderer failure fallback: interactive DOM signal overview; no alternate 2D renderer
- Runtime model namespace: `/pharosville/models/`
- Latest app version: `v0.3.0` (`trueWaters`)
- Latest changelog entry: `2026-07-10-true-waters` / `v0.3.0` / 2026-07-10 / True Waters

## Viewport Gate

- Long side minimum: `720px`
- Short side minimum: `360px`
- World runtime mounts only after the screen-size gate passes and the current viewport is landscape.
- `src/client.tsx` lazy-loads the desktop data and Three.js runtime only after that gate; `npm run check:viewport-gate` guards the boundary.

## API Allowlist

- `/api/stablecoins`
- `/api/chains`
- `/api/stability-index?detail=true`
- `/api/peg-summary`
- `/api/stress-signals`
- `/api/report-cards`

## Runtime Media

- Stablecoin sails and rendered-harbor flags load same-origin logo images into shared in-memory atlases with deterministic mark fallbacks.
- Ship, dock, island, cemetery, ambient-life, and water visuals are renderer-owned procedural geometry/materials.
- Water normal: `/pharosville/textures/water-normals.png` with a content-hash query.

| Model | URL | Bytes | Geometry | SHA-256 |
| --- | --- | --- | --- | --- |
| `garden-lighthouse-shell` | `/pharosville/models/garden-lighthouse-shell.glb` | 534 KiB | 7 draws / 33,444 tris / 21,642 verts / 0 textures | `390477368cfecc235a771300f7cecfc1f8047a6adfa43806cd198f911ba7b03b` |
| `garden-hero-titan` | `/pharosville/models/garden-hero-titan.glb` | 115 KiB | 5 draws / 3,326 tris / 4,158 verts / 0 textures | `58ac01cea7373a2a4b822fd4cdc61ea54f7735fec624a04ab68ce2d548a945a5` |
| `garden-hero-heritage` | `/pharosville/models/garden-hero-heritage.glb` | 92 KiB | 5 draws / 2,680 tris / 3,293 verts / 0 textures | `b4ff92bbef095a35bd75a9f69989d8fd9f48acd16a994e5902b663d97d6328d2` |
| `garden-hero-carrack` | `/pharosville/models/garden-hero-carrack.glb` | 117 KiB | 5 draws / 3,264 tris / 4,198 verts / 0 textures | `2a7d4241888b5c3047980440fe409984c03061285b8bbe8d34a60b09fcf362f3` |
| `garden-hero-brigantine` | `/pharosville/models/garden-hero-brigantine.glb` | 73 KiB | 5 draws / 2,150 tris / 2,499 verts / 0 textures | `547d7957b216c8f022485453f30ff805fa3c838378d776bd1a6e4ace525e3235` |
| `garden-hero-dhow` | `/pharosville/models/garden-hero-dhow.glb` | 75 KiB | 5 draws / 2,094 tris / 2,592 verts / 0 textures | `229f0f53b10880c4a2dc3d950e75435497d775468b96f3b28adf993998773c7c` |
| `garden-hero-junk` | `/pharosville/models/garden-hero-junk.glb` | 78 KiB | 5 draws / 2,264 tris / 2,695 verts / 0 textures | `4c92815b2a9cf9199a5cd86295aa8958eef386768b2ab2e580f35db60b4f32a8` |
| `garden-hero-barquentine` | `/pharosville/models/garden-hero-barquentine.glb` | 91 KiB | 5 draws / 2,724 tris / 3,228 verts / 0 textures | `9dd4786a6b59871821b0fc13323c3a19aea9392dd98cdb0976fbaab702911fb0` |
| `garden-hero-cog` | `/pharosville/models/garden-hero-cog.glb` | 81 KiB | 5 draws / 2,188 tris / 2,786 verts / 0 textures | `57a936f6e08270ec7deeb1a02cd7c85645c8aa0df37317915f4feef3c7fa3cfe` |
| `garden-hero-xebec` | `/pharosville/models/garden-hero-xebec.glb` | 89 KiB | 5 draws / 2,486 tris / 3,078 verts / 0 textures | `6ddcd20d59d4a4f05d23aefd72c3fb7781cbb8c628ceb577ea7b6971e2ca2ed2` |
| `garden-hero-cutter` | `/pharosville/models/garden-hero-cutter.glb` | 76 KiB | 5 draws / 2,064 tris / 2,585 verts / 0 textures | `3749cbffb9b40890c20417db83d54c2b91eb4e9a86d4e871ac200480b8bc9aaa` |
| `garden-hero-tether` | `/pharosville/models/garden-hero-tether.glb` | 139 KiB | 5 draws / 3,694 tris / 5,106 verts / 0 textures | `82922b953b9ac26b79acab270f4a86bf0c58a644e6495d2153f9d1eff2f95a73` |
| `garden-hero-circle` | `/pharosville/models/garden-hero-circle.glb` | 119 KiB | 5 draws / 3,328 tris / 4,265 verts / 0 textures | `97234dcb62a33a34c9faebeaf9653ff60e49f2dc2d4972a93979017ea02caea8` |
| `garden-hero-maker` | `/pharosville/models/garden-hero-maker.glb` | 95 KiB | 5 draws / 2,682 tris / 3,349 verts / 0 textures | `62c54aaca58107c36c6e340840b12eddfc6f8ed73209c1e0b82aa59a86e98e87` |
| `garden-hero-sky` | `/pharosville/models/garden-hero-sky.glb` | 101 KiB | 5 draws / 2,926 tris / 3,570 verts / 0 textures | `cc4a65e603838fdba0d473dbf489763c0f3fe55250b8306dc64293da42e8f8aa` |
| `garden-hero-ethena` | `/pharosville/models/garden-hero-ethena.glb` | 82 KiB | 5 draws / 2,794 tris / 2,714 verts / 0 textures | `529057227169d58c391e9e7ec518c8a734e431b73d888e952c24b88687613c90` |
| `garden-hero-liberty` | `/pharosville/models/garden-hero-liberty.glb` | 108 KiB | 5 draws / 2,830 tris / 3,901 verts / 0 textures | `97d4fdb9eab8b7ac028a5398a4281141a8c77a8afaae2ccd7a5ee6466a35c81f` |
| `garden-hero-paypal` | `/pharosville/models/garden-hero-paypal.glb` | 93 KiB | 5 draws / 2,658 tris / 3,250 verts / 0 textures | `8ac72d2599a35a219db0d4c46d6ada7334eac26eb622d00f5018c41212f2378d` |
| `garden-hero-bullion` | `/pharosville/models/garden-hero-bullion.glb` | 73 KiB | 5 draws / 2,106 tris / 2,495 verts / 0 textures | `366eceaaf57026f6f041bdb1985ce1a7637b1ef7c64bf1f6671acce871af59e0` |

- The procedural lighthouse shell remains the in-scene fallback if its GLB cannot load.

## Bundle Budgets

- entry chunk: raw <= 300 KiB, gzip <= 90 KiB
- desktop lazy chunk: raw <= 1,024 KiB, gzip <= 290 KiB
- world lazy chunk: raw <= 440 KiB, gzip <= 145 KiB
- Three.js renderer chunk: raw <= 1,600 KiB, gzip <= 420 KiB
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

- Deploy workflow jobs: `typecheck`, `unit`, `guards`, `build`, `visual`, `visual-cross-browser`, `deploy`
- Canary smoke cron: `*/30 * * * *`
- GitHub Release publication follows successful `Deploy to Cloudflare Pages` runs on `main`
- GitHub Release audit cron: `17 5 * * *`


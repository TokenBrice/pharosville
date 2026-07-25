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

- The ship-logo pipeline loads same-origin stablecoin logo images only.
- Ship, dock, island, cemetery, ambient-life, and water visuals are renderer-owned procedural geometry/materials.
- Water normal: `/pharosville/textures/water-normals.png` with a content-hash query.

| Model | URL | Bytes | Geometry | SHA-256 |
| --- | --- | --- | --- | --- |
| `garden-lighthouse-shell` | `/pharosville/models/garden-lighthouse-shell.glb` | 507 KiB | 7 draws / 31,716 tris / 20,598 verts / 0 textures | `03b846716b7113f05c5878272a37076b8497f87efea72788026f2451283d6dbf` |
| `garden-hero-titan` | `/pharosville/models/garden-hero-titan.glb` | 108 KiB | 4 draws / 3,202 tris / 3,926 verts / 0 textures | `ccdcdb79701aeb235d4492bf6c6f500c012209cef74a514326d0cf7a5e2e9d57` |
| `garden-hero-heritage` | `/pharosville/models/garden-hero-heritage.glb` | 89 KiB | 4 draws / 2,644 tris / 3,231 verts / 0 textures | `6626047544c4a69662b07d6feb63f6f487ba3e4995d364cd734227a763fe3cfa` |
| `garden-hero-carrack` | `/pharosville/models/garden-hero-carrack.glb` | 107 KiB | 4 draws / 3,096 tris / 3,862 verts / 0 textures | `f5b1fb7510f93e50500568961f72134b2317aaf9b115a87412ab0642a4868560` |
| `garden-hero-brigantine` | `/pharosville/models/garden-hero-brigantine.glb` | 69 KiB | 4 draws / 2,102 tris / 2,413 verts / 0 textures | `a003880b4ff4b613ce6f92bfec1cb6c05d101e6214731d30cf9819ff982509fc` |
| `garden-hero-dhow` | `/pharosville/models/garden-hero-dhow.glb` | 73 KiB | 4 draws / 2,074 tris / 2,558 verts / 0 textures | `a5735f39e261a518071ad4aa8ceb68cacbe7c0547c57345bfae1f19ae7ce20e4` |
| `garden-hero-junk` | `/pharosville/models/garden-hero-junk.glb` | 75 KiB | 4 draws / 2,236 tris / 2,639 verts / 0 textures | `2c1c25539bdedfcf52f9d873416bd2506cdcd212740614db14b15803fe8fcc18` |
| `garden-hero-barquentine` | `/pharosville/models/garden-hero-barquentine.glb` | 88 KiB | 4 draws / 2,684 tris / 3,160 verts / 0 textures | `a5b826767199f9083102d120ad4614fcf95cdaa873faed1f3d223e19ac5652b8` |
| `garden-hero-cog` | `/pharosville/models/garden-hero-cog.glb` | 75 KiB | 4 draws / 2,072 tris / 2,602 verts / 0 textures | `180d6c27e6e40856a2e4c313d2544ff5444f41ebedec9c5676ea1e45d67142f4` |
| `garden-hero-xebec` | `/pharosville/models/garden-hero-xebec.glb` | 84 KiB | 4 draws / 2,428 tris / 2,959 verts / 0 textures | `9b9dc6216a9750fe9a9797df6a0f393c908a26dc7b288317b3c7261e89a20a05` |
| `garden-hero-cutter` | `/pharosville/models/garden-hero-cutter.glb` | 74 KiB | 4 draws / 2,044 tris / 2,551 verts / 0 textures | `66caa65385a58191382d6d4014d8f24c3f6f23874e3f4e355ec9108072f3cdc7` |

- The procedural lighthouse shell remains the in-scene fallback if its GLB cannot load.

## Bundle Budgets

- entry chunk: raw <= 300 KiB, gzip <= 90 KiB
- desktop lazy chunk: raw <= 1,024 KiB, gzip <= 290 KiB
- world lazy chunk: raw <= 440 KiB, gzip <= 145 KiB
- Three.js renderer chunk: raw <= 820 KiB, gzip <= 218 KiB
- entry CSS: raw <= 36 KiB, gzip <= 8 KiB
- Total JS: raw <= 1,860 KiB, gzip <= 530 KiB

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


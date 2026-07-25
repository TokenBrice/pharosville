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
| `garden-hero-titan` | `/pharosville/models/garden-hero-titan.glb` | 109 KiB | 5 draws / 3,202 tris / 3,926 verts / 0 textures | `6ea4288ddf7d68147b3bcec955d8aec76075b4035a6458273d4073d5eb5d4c9a` |
| `garden-hero-heritage` | `/pharosville/models/garden-hero-heritage.glb` | 90 KiB | 5 draws / 2,644 tris / 3,231 verts / 0 textures | `d58ed297847e84b60f8deaa56a7067480ce2ea7076d41ea4f8338b8b7a678f25` |
| `garden-hero-carrack` | `/pharosville/models/garden-hero-carrack.glb` | 108 KiB | 5 draws / 3,096 tris / 3,862 verts / 0 textures | `ece41287cb456dfc5006b49c050979f43fca22cc22e88524af8c46e8e9ba1e44` |
| `garden-hero-brigantine` | `/pharosville/models/garden-hero-brigantine.glb` | 70 KiB | 5 draws / 2,102 tris / 2,413 verts / 0 textures | `346e894d912d485a1143aca015bed891b959805899c58fe7ec83490d06ac9dfe` |
| `garden-hero-dhow` | `/pharosville/models/garden-hero-dhow.glb` | 74 KiB | 5 draws / 2,074 tris / 2,558 verts / 0 textures | `4c9fd30891fe2b8691d3893f5d91d149bc4f8b8fcbb806ad05dd0456add3da79` |
| `garden-hero-junk` | `/pharosville/models/garden-hero-junk.glb` | 76 KiB | 5 draws / 2,236 tris / 2,639 verts / 0 textures | `f2f6155c37f7c01bf2a64d65765cfc2b0e6ae69822699c8e536e228d59336222` |
| `garden-hero-barquentine` | `/pharosville/models/garden-hero-barquentine.glb` | 89 KiB | 5 draws / 2,684 tris / 3,160 verts / 0 textures | `80d9007384da9754f52c56a4d1db166b23552878dadc2c6a461b554f9d05933f` |
| `garden-hero-cog` | `/pharosville/models/garden-hero-cog.glb` | 76 KiB | 5 draws / 2,072 tris / 2,602 verts / 0 textures | `44b47d3bab8dd6f2649dca20f9e65efe2f49357760a7c4d1ea6ca3fc96123a58` |
| `garden-hero-xebec` | `/pharosville/models/garden-hero-xebec.glb` | 85 KiB | 5 draws / 2,428 tris / 2,959 verts / 0 textures | `c05faa15f16f436e4170736ee8e786ad7afb7ba4d8aa2e9cad76c90c46d9095c` |
| `garden-hero-cutter` | `/pharosville/models/garden-hero-cutter.glb` | 75 KiB | 5 draws / 2,044 tris / 2,551 verts / 0 textures | `bddd3708c3c53bd125fa6e4b8e8953516b525f132565190e4f837e1333a3f3f5` |
| `garden-hero-tether` | `/pharosville/models/garden-hero-tether.glb` | 116 KiB | 5 draws / 3,218 tris / 4,212 verts / 0 textures | `35c7f69b114152a66cc22b54873c425b90c4059bd624df978bba570d623c6cf5` |
| `garden-hero-circle` | `/pharosville/models/garden-hero-circle.glb` | 85 KiB | 5 draws / 2,580 tris / 2,990 verts / 0 textures | `b2c4b816501da38ff26e9f215efc87a6dd75c7f80fc882a2eb8c89886191d948` |
| `garden-hero-maker` | `/pharosville/models/garden-hero-maker.glb` | 80 KiB | 5 draws / 2,362 tris / 2,772 verts / 0 textures | `ea5d3d6da183cb4f7352d355e0ce9f181e7431d83647c496b9ca4087899e3ef7` |
| `garden-hero-sky` | `/pharosville/models/garden-hero-sky.glb` | 85 KiB | 5 draws / 2,574 tris / 2,938 verts / 0 textures | `99e43e9a03c852981b681ecf1a979178faa2ff477ad1765b030c0d33006aa4f6` |
| `garden-hero-ethena` | `/pharosville/models/garden-hero-ethena.glb` | 66 KiB | 5 draws / 2,426 tris / 2,055 verts / 0 textures | `701f3ed02dfb4ea38a981b948a83de70966140a66d91647d8a6bebc2382d75a1` |
| `garden-hero-liberty` | `/pharosville/models/garden-hero-liberty.glb` | 76 KiB | 5 draws / 2,138 tris / 2,646 verts / 0 textures | `b1e95e1587ff4b782e88f0be14ea5f32e7abb4bc5ff80c0a80de219f53edb2f6` |
| `garden-hero-paypal` | `/pharosville/models/garden-hero-paypal.glb` | 82 KiB | 5 draws / 2,398 tris / 2,791 verts / 0 textures | `9d86dca0b47fc1420fe01ef89a3758baa39290925bf15d467a1dc8a07dc7f7f2` |

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


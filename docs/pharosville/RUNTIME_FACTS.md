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
| `garden-hero-tether` | `/pharosville/models/garden-hero-tether.glb` | 139 KiB | 5 draws / 3,694 tris / 5,106 verts / 0 textures | `4eb56cb7e9a9649a5645e1ad45dff735c0c29a59f4e64119f5691e60d47daac6` |
| `garden-hero-circle` | `/pharosville/models/garden-hero-circle.glb` | 119 KiB | 5 draws / 3,328 tris / 4,265 verts / 0 textures | `24e736aec6af668c1f61a8fba1328408667419648d71cfda72f57523530f2831` |
| `garden-hero-maker` | `/pharosville/models/garden-hero-maker.glb` | 95 KiB | 5 draws / 2,682 tris / 3,349 verts / 0 textures | `6a2397cde4226dbfae8eea6d142364d58cfe60f4a1da9a2452a20f7cdc93adab` |
| `garden-hero-sky` | `/pharosville/models/garden-hero-sky.glb` | 100 KiB | 5 draws / 2,926 tris / 3,570 verts / 0 textures | `230bba7fe1acda1e46efe5f6e94c339546f9f7edb9a1ae5dfca8d44ce6137a92` |
| `garden-hero-ethena` | `/pharosville/models/garden-hero-ethena.glb` | 82 KiB | 5 draws / 2,794 tris / 2,714 verts / 0 textures | `51540d4c5783803f350d3a2f1f20f3fa37b556cbeab6afedab34aa7029fc3cd5` |
| `garden-hero-liberty` | `/pharosville/models/garden-hero-liberty.glb` | 107 KiB | 5 draws / 2,830 tris / 3,901 verts / 0 textures | `be738709bb0f06ffc5ed4cfc2c49246e5dfec559ae36beb26696ca81749a3717` |
| `garden-hero-paypal` | `/pharosville/models/garden-hero-paypal.glb` | 93 KiB | 5 draws / 2,658 tris / 3,250 verts / 0 textures | `0a7c49d223d8411b31302dd067fc355b9154a682c9b9cffb276b6ba8317bd16c` |
| `garden-hero-bullion` | `/pharosville/models/garden-hero-bullion.glb` | 73 KiB | 5 draws / 2,106 tris / 2,495 verts / 0 textures | `730dc6b80ca2965678e539b2b7454848c8d8b0c24ad67061f9ec04fb75d3eceb` |

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


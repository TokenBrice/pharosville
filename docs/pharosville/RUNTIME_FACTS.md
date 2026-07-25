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
| `garden-hero-titan` | `/pharosville/models/garden-hero-titan.glb` | 115 KiB | 5 draws / 3,326 tris / 4,158 verts / 0 textures | `9781336f543636254d9fef561948406ea5e32c0f9d76ed3ec6cbccbfe0e20c0a` |
| `garden-hero-heritage` | `/pharosville/models/garden-hero-heritage.glb` | 92 KiB | 5 draws / 2,680 tris / 3,293 verts / 0 textures | `2ebc0db2ff3f367cd2206bc7cc881e3d6047f1992a20a3b6766d3b55e136792f` |
| `garden-hero-carrack` | `/pharosville/models/garden-hero-carrack.glb` | 117 KiB | 5 draws / 3,264 tris / 4,198 verts / 0 textures | `9f99819938c53a221bd35fc7e5aff7e8e8cf06b92b06b2a4359a6bcc3149732e` |
| `garden-hero-brigantine` | `/pharosville/models/garden-hero-brigantine.glb` | 72 KiB | 5 draws / 2,150 tris / 2,499 verts / 0 textures | `411409b1e79fd49eacba12ff828e2816e1f2144effa3cb85f586f6a8aebf8dd5` |
| `garden-hero-dhow` | `/pharosville/models/garden-hero-dhow.glb` | 75 KiB | 5 draws / 2,094 tris / 2,592 verts / 0 textures | `7a20a160ced1cddecdc7cccaf973fb1630a1284b388899ccc4d5a0c95aa6816b` |
| `garden-hero-junk` | `/pharosville/models/garden-hero-junk.glb` | 77 KiB | 5 draws / 2,264 tris / 2,695 verts / 0 textures | `8fe4f736281add63e01d905965c4c16d3e78302cea2f267b4bc1562e5350483c` |
| `garden-hero-barquentine` | `/pharosville/models/garden-hero-barquentine.glb` | 91 KiB | 5 draws / 2,724 tris / 3,228 verts / 0 textures | `d2d94ea53cd3c982aeb2ce00bd09c95d6f9d3638761ea1c22edc8a81d015b88f` |
| `garden-hero-cog` | `/pharosville/models/garden-hero-cog.glb` | 81 KiB | 5 draws / 2,188 tris / 2,786 verts / 0 textures | `a77dc9655243ae7c64c6eb04adf4124eff0f18e2cec726bb27fa0ba99c609299` |
| `garden-hero-xebec` | `/pharosville/models/garden-hero-xebec.glb` | 89 KiB | 5 draws / 2,486 tris / 3,078 verts / 0 textures | `042d616ade6c20cebedcea4b7ab008c5eedb6d62fbdcff2382360e8d6be37e41` |
| `garden-hero-cutter` | `/pharosville/models/garden-hero-cutter.glb` | 76 KiB | 5 draws / 2,064 tris / 2,585 verts / 0 textures | `22b043632fee45603c863931a0a493332e8be770f3b097761673bd4181e53861` |
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


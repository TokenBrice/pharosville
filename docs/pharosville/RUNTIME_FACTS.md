# PharosVille Runtime Facts

Generated from repository source. Do not edit by hand.

Regenerate with `npm run docs:runtime-facts`; verify with `npm run check:runtime-facts`.

## App And Routes

- Canonical app URL: `https://pharosville.pharos.watch/`
- Renderer: one production Three.js/WebGL renderer
- GPU or renderer failure fallback: interactive DOM signal overview; no alternate 2D renderer
- Runtime model namespace: `/pharosville/models/`
- Latest app version: `v0.8.0` (`gardenOfLight`)
- Latest changelog entry: `2026-08-13-garden-of-light` / `v0.8.0` / 2026-08-13 / Garden of Light

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
| `garden-hero-titan` | `/pharosville/models/garden-hero-titan.glb` | 20 KiB | 4 draws / 930 tris / 842 verts / 0 textures | `226d585a2264290773b1dc487cc4e7f974a7735cec8a1ffebd0ea1aa01ec67f6` |
| `garden-hero-heritage` | `/pharosville/models/garden-hero-heritage.glb` | 20 KiB | 4 draws / 930 tris / 842 verts / 0 textures | `07dd1b57119aca31cc22a86d7347a9f7876c62601f02f45aec937658720789fe` |
| `garden-hero-carrack` | `/pharosville/models/garden-hero-carrack.glb` | 24 KiB | 5 draws / 1,058 tris / 1,032 verts / 0 textures | `70f87b2d3c2c66133027028f3d0a7299b58834c1f7c657e308495e62e3b6013a` |
| `garden-hero-brigantine` | `/pharosville/models/garden-hero-brigantine.glb` | 29 KiB | 5 draws / 1,270 tris / 1,366 verts / 0 textures | `2a00702207a19b49c688f815da7bc0f80697b4afa8667a4777f87da67576bab7` |
| `garden-hero-dhow` | `/pharosville/models/garden-hero-dhow.glb` | 23 KiB | 5 draws / 1,054 tris / 969 verts / 0 textures | `3bb620332d6bad25402985e7f77640f36387b7e903f439eb123617bdb1048358` |
| `garden-hero-junk` | `/pharosville/models/garden-hero-junk.glb` | 26 KiB | 5 draws / 1,214 tris / 1,213 verts / 0 textures | `0db88b55685fe0086ff46bff3eb3f140578fcb77321a7b7d92d9522f30bf2f2c` |
| `garden-hero-barquentine` | `/pharosville/models/garden-hero-barquentine.glb` | 33 KiB | 5 draws / 1,812 tris / 1,534 verts / 0 textures | `fbeed772c2ebec026bb18f6edde050c494414892aab6546bb8dfb532bfd1432c` |
| `garden-hero-cog` | `/pharosville/models/garden-hero-cog.glb` | 24 KiB | 5 draws / 1,092 tris / 946 verts / 0 textures | `8a1b0f5fcfd064325c0d9cfbbfbeb78bdc2cbd51f28945145d9db5aa8b3a4792` |
| `garden-hero-xebec` | `/pharosville/models/garden-hero-xebec.glb` | 26 KiB | 5 draws / 1,214 tris / 1,213 verts / 0 textures | `87c09779b7cfbee024e8571fef17147fa32c720a3fe588e6373e5baa1a1e9540` |
| `garden-hero-cutter` | `/pharosville/models/garden-hero-cutter.glb` | 23 KiB | 5 draws / 1,046 tris / 950 verts / 0 textures | `c3cb5c76cbaa1e72a35159d591a6c8e02370fcef2901c92adfa75f4648c0c9aa` |
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
- Preferred chain IDs: `x`, `cove`, `id`, `body`, `tile`, `seawardBearing`, `width`, `type`
- Suppressed rendered harbor IDs: `optimism`
- Detached dispatch wharf chain IDs: `ton`

## Workflow Gates

- Deploy workflow jobs: `validate`, `visual`, `deploy`
- Canary smoke cron: `*/30 * * * *`
- GitHub Release publication follows successful `Deploy to Cloudflare Pages` runs on `main`
- GitHub Release audit cron: `17 5 * * *`


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

- `useAssetLoadingPipeline` loads same-origin stablecoin logo images only.
- Ship, dock, island, cemetery, ambient-life, and water visuals are renderer-owned procedural geometry/materials.
- Lighthouse model: `garden-lighthouse-shell` at `/pharosville/models/garden-lighthouse-shell.glb`
- Lighthouse GLB: 63 KiB, SHA-256 `25fd507abedd77ff98e00fba2f89202b73cd24ccfe4de76d1acfb6b14c1030d3`, compression `none`
- Lighthouse geometry: 7 draw calls, 1,020 triangles, 1,561 vertices, 0 textures
- The procedural lighthouse shell remains the in-scene fallback if its GLB cannot load.

## Archived Raster Inventory

- `public/pharosville/assets/manifest.json` is retained for source history and validation; browser runtime does not load it.
- Schema version: `2`; cache version: `2026-06-W6-identity-pass`; style anchor: `2026-04-29-lighthouse-hill-v5`
- Entries: `73`; prior first-render set: `33`
- Categories: dock: 12, landmark: 4, overlay: 6, prop: 21, ship: 23, terrain: 7
- Optional WebP twins: `72` static paths, `13` animation frame sources

## Asset Budgets

- These budgets guard the archived raster authoring inventory; they are not runtime boot budgets.
- Authoring inventory: count <= 75, bytes <= 1,100 KiB, decoded pixels <= 1,440,000
- Prior first-render classification: count <= 33, bytes <= 575 KiB, decoded pixels <= 875,000
- Prior shell-critical classification: count <= 10, bytes <= 120 KiB, decoded pixels <= 220,000

## Bundle Budgets

- entry chunk: raw <= 300 KiB, gzip <= 90 KiB
- desktop lazy chunk: raw <= 1,024 KiB, gzip <= 290 KiB
- world lazy chunk: raw <= 440 KiB, gzip <= 145 KiB
- Three.js renderer chunk: raw <= 740 KiB, gzip <= 200 KiB
- entry CSS: raw <= 36 KiB, gzip <= 8 KiB
- Total JS: raw <= 1,800 KiB, gzip <= 515 KiB

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
| `paxg-paxos` | `1.32` |
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


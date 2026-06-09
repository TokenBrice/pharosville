# PharosVille Runtime Facts

Generated from repository source. Do not edit by hand.

Regenerate with `npm run docs:runtime-facts`; verify with `npm run check:runtime-facts`.

## App And Routes

- Canonical app URL: `https://pharosville.pharos.watch/`
- Runtime asset namespace: `/pharosville/assets/`
- Latest app version: `v0.2.1` (`curtainUp`)
- Latest changelog entry: `2026-05-18-curtain-up` / `v0.2.1` / 2026-05-18 / Curtain Up

## Viewport Gate

- Long side minimum: `720px`
- Short side minimum: `360px`
- World runtime mounts only after the screen-size gate passes and the current viewport is landscape.
- `index.html` has a matching runtime-manifest preload media query checked by `npm run check:viewport-gate`.

## API Allowlist

- `/api/stablecoins`
- `/api/chains`
- `/api/stability-index?detail=true`
- `/api/peg-summary`
- `/api/stress-signals`
- `/api/report-cards`

## Asset Manifest

- Schema version: `2`
- Cache version: `2026-06-W6-identity-pass`
- Style anchor: `2026-04-29-lighthouse-hill-v5`
- Manifest entries: `73`
- Required for first render: `33`
- Categories: dock: 12, landmark: 4, overlay: 6, prop: 21, ship: 23, terrain: 7
- Load priorities: critical: 33, deferred: 40
- Phases: deferred: 40, shellCritical: 6, visibleCritical: 27
- Optional WebP twins: `72` static paths, `13` animation frame sources

## Asset Budgets

- Runtime manifest: count <= 75, bytes <= 1,100 KiB, decoded pixels <= 1,440,000
- First render: count <= 33, bytes <= 575 KiB, decoded pixels <= 875,000
- Shell-critical: count <= 10, bytes <= 120 KiB, decoded pixels <= 220,000

## Bundle Budgets

- entry chunk: raw <= 300 KiB, gzip <= 90 KiB
- desktop lazy chunk: raw <= 1,000 KiB, gzip <= 290 KiB
- entry CSS: raw <= 32 KiB, gzip <= 8 KiB
- Total JS: raw <= 1,315 KiB, gzip <= 388 KiB

## Squads

| Squad | Flagship | Members |
| --- | --- | --- |
| Sky | `usds-sky` | `usds-sky`, `stusds-sky`, `susds-sky` |
| Maker | `dai-makerdao` | `dai-makerdao`, `sdai-sky` |
| Ethena | `usde-ethena` | `usde-ethena`, `susde-ethena` |

## Titan Ships

| Stablecoin ID | Asset ID | Scale |
| --- | --- | --- |
| `buidl-blackrock` | `ship.buidl-titan` | `1.4` |
| `dai-makerdao` | `ship.dai-titan` | `1.06` |
| `pyusd-paypal` | `ship.pyusd-titan` | `1.4` |
| `sdai-sky` | `ship.sdai-titan` | `0.94` |
| `stusds-sky` | `ship.stusds-titan` | `0.98` |
| `susde-ethena` | `ship.susde-titan` | `0.95` |
| `susds-sky` | `ship.susds-titan` | `0.94` |
| `usd1-world-liberty-financial` | `ship.usd1-titan` | `1.35` |
| `usdc-circle` | `ship.usdc-titan` | `1.53` |
| `usde-ethena` | `ship.usde-titan` | `1.2` |
| `usds-sky` | `ship.usds-titan` | `1.15` |
| `usdt-tether` | `ship.usdt-titan` | `1.7` |

## Heritage Hulls

| Stablecoin ID | Asset ID | Scale |
| --- | --- | --- |
| `bold-liquity` | `ship.bold-unique` | `1.23` |
| `crvusd-curve` | `ship.crvusd-unique` | `1.28` |
| `fxusd-f-x-protocol` | `ship.fxusd-unique` | `1.23` |
| `paxg-paxos` | `ship.paxg-unique` | `1.32` |
| `usyc-hashnote` | `ship.usyc-unique` | `1.2` |
| `xaut-tether` | `ship.xaut-unique` | `1.28` |

## Dock Rules

- Standard chain harbor cap: `8`
- Preferred chain IDs: `ethereum`, `base`, `arbitrum`, `polygon`, `bsc`, `tron`, `solana`, `hyperliquid`, `aptos`, `avalanche`
- Suppressed rendered harbor IDs: `optimism`
- Detached dispatch wharf chain IDs: `ton`
- Dock asset IDs: `dock.ethereum-civic-cove`, `dock.tron-arena-wharf`, `dock.bsc-mercantile-wharf`, `dock.solana-prism-stilt`, `dock.base-modular-slip`, `dock.arbitrum-arch-bridge`, `dock.polygon-hexmarket`, `dock.aptos-jade-pagoda`, `dock.avalanche-alpine-watch`, `dock.ton-pigeonnier-pier`, `dock.hyperliquid-trading-floor`

## Workflow Gates

- Deploy workflow jobs: `typecheck`, `unit`, `guards`, `build`, `visual`, `visual-cross-browser`, `deploy`
- Canary smoke cron: `*/30 * * * *`


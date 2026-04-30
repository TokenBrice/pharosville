# Stablecoin Data Agent Notes

Applies to `shared/data/stablecoins/**`.

## Read First

- `shared/AGENTS.md`
- `shared/data/stablecoins/PROVENANCE_NOTES.md`
- `shared/lib/stablecoins/schema.ts`

## Rules

- This directory is copied shared data for standalone PharosVille. Do not treat host-repo authoring docs or generation scripts as executable here unless they are present in this repository.
- Avoid editing stablecoin catalog JSON from PharosVille maintenance tasks. If a data correction is required, make the change in the canonical upstream data workflow and copy the resulting artifact here intentionally.
- Do not edit `shared/data/stablecoins/coins.generated.json` by hand.
- Treat `usd-major.json`, `usd-minor.json`, `non-usd.json`, `commodity.json`, and `pre-launch.json` as read-only compatibility shells.
- Keep `canonical-order.json` aligned with any intentionally copied per-coin catalog update.
- Do not add manual, on-chain, CMC, or DEX supply overrides. Primary supply is DefiLlama with the existing fallback path only.
- DefiLlama list endpoint `circulating` values are already USD-denominated; do not multiply them by price.
- Add or update contracts only when the address is verified against the relevant source.
- If adding a data source, classification rule, or methodology semantic, coordinate with the host-repo source of truth before copying changes into this standalone app.

## Common Checks

- `npm run typecheck`
- `npm run build`
- `npm test` for the standalone default suite.
- Focused shared stablecoin tests may be run by explicit file path only after confirming they do not depend on host-repo scripts, docs, generated files, or runtime services that are absent here.

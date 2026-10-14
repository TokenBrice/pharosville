# P6 brief: operator feedback round (2026-10-14)

Operator verdict: "amazing composition, so much better, truly loving this direction". Make it MORE EPIC, and make
the core (harbours, sea zones, customs/flows) INSTANTLY OBVIOUS.

## Decisions (D15–D23), binding

| ID | Decision |
|---|---|
| D15 | **The Pharos of Alexandria.** The hero becomes the actual ancient Pharos (refs: operator's images; classic three-tier form). It needs ~2.5× the presence of the current tower: ~95–110 m to the statue top (houses stay 7–11 m). It must dominate the skyline in heart AND overview. |
| D16 | **The light is an ancient beacon.** A great FIRE in the lantern (visible flames, embers, heat shimmer) plus a polished bronze MIRROR that throws the rotating beam. Warm and golden, not an electric white lens. Beam rhythm/reach/colour still encode PSI (D-research/04). |
| D17 | **Harbour identity without hover.** Each chain harbour is an unmistakable district (see the list below). |
| D18 | **Sea zones explicit without hover.** Each zone gets a distinct physical treatment AND chart lettering on the water (see the list below). |
| D19 | **The tide board is removed** (it broke immersion). It is replaced by **the Mint and the Burn** (see the list below). The Customs House stays as the grand civic anchor of the flows quarter. The panel keeps the exact numbers. |
| D20 | **The Shipyard** for the registry's pre-launch coins (see the list below). |
| D21 | **Signal over filler.** Cut generic filler houses by ~50%. Land is for UTILITY buildings that tell a Pharos-watch data story: chain harbour offices, the Customs House, the Mint, the Burn furnace, the Shipyard, the Registry (safety grades), the Chart Room (PSI history), the Storm-signal station (DEWS), the Harbourmaster (movers), the Keeper's Log (freshness). Keep a modest residential quarter for charm only. |
| D22 | **More boats under way.** Target ~12–18% of hulls under way at any moment (from ~5%), with dockings ~10–15/min. (a) Shorter circuit periods (tuning, not data). (b) DECLARED-DECORATIVE "harbour outings" for single-chain boats: a loop out of their harbour and back to the same berth; the legend says so. Keep separation and land safety. |
| D23 | **Audio refinement,** especially the waves. |

D17 — what makes a harbour unmistakable:
- a harbour office/warehouse building in that chain's architecture accent;
- the chain's crest (`public/chains/*.svg`) large on its facade and on a tall house flag;
- chain-colour awnings, bollards and pier-head beacon;
- the chain's name in chart lettering on the harbour water ("ETHEREUM").

D18 — the zones and their treatments:

| Zone | Physical treatment |
|---|---|
| The Shoals | A visible reef with breaking surf, red/white hazard buoys and a reef beacon |
| The Far Ports | A buoyed anchorage with marker lights |
| Wreck Cove | Masts and ribs on the beach |
| The Roads | The outer mooring field |
| Each harbour's water | Named |

- The lettering is diegetic chart lettering laid on the water in perspective (nautical-chart serif, letter-spaced caps, thin rules), like a sea chart printed on the sea.
- It is calm and legible, fades by zoom and time, and is faint at night.

D19 — the Mint and the Burn:
- **The Mint:** a coin-minting complex whose chimneys, furnace glow, waterwheel/press motion and worker bustle scale with mint volume.
- **The Burn furnace:** coins are burned there, and its fire and smoke scale with burn volume. When the net trend is negative, the burn dominates.
- Scope: Ethereum, Base and Arbitrum, the honest scope of the mint/burn data.

D20 — the Shipyard:
- The registry's pre-launch coins (`shared/data/stablecoins/coins.generated.json`, `status: "pre-launch"`, currently 11) are hulls on slipways.
- Each hull's construction stage comes from `launchPhase` / milestones: keel → ribs → planking → painted → rigged.
- Each carries a name board.
- When a coin appears live in the payload, its hull launches down the slip (the existing Slipway voyage).

## Shared rules (unchanged)

- Worktree `/home/ahirice/Documents/git/pharosville/.worktrees/harbour`. Dev server http://localhost:5190/ is running: never start or kill it.
- **NEVER launch a browser.** Only `node scripts/harbour/shot.mjs` (one persistent headless real-GPU Chrome). LOOK at every PNG.
- Owned paths only; no commits; no .md files from scratch; report in your return value. Keep tsc, eslint and vitest green.
- Style: C "Northern Light" crafted-miniature look. Civic buildings may be neoclassical stone to bridge to the Pharos.

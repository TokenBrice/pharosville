# PharosVille Visual Invariants

Last updated: 2026-05-01

These are the non-negotiable visual/data contracts for the PharosVille world. A change that violates one of these is a product behavior change and needs explicit intent plus matching tests and docs.

## Route And Runtime

- `/pharosville/` is desktop-only. The world must not mount below `1280px` width or `760px` height.
- The fallback must avoid world API queries, `/_site-data` world queries, asset manifest fetches, canvas setup, and sprite/logo decode work.
- The route uses existing Pharos frontend hooks and API payloads. Visual-only work must not add Worker/API contracts unless explicitly requested.
- No production fixture/default market data is allowed.
- The visual target is a Pharos maritime observatory diorama, not a ClaudeVille clone. Do not import ClaudeVille lore, fantasy-village scenery, agent mechanics, decorative copy, or unrelated entities into the route.

## Data Truth

- Canvas is a representation, not the only source of analytical truth.
- Every visual signal with analytical meaning must have detail-panel or accessibility-ledger parity.
- Source fields and caveats belong in details when a visual encoding could be misread.
- Stablecoin list `circulating` values are already USD-denominated; use `getCirculatingRaw()` for market-cap tiers.

## Geography

- The current map acceptance target is a sea-first isometric island with roughly 85.2-85.6% water by tile count after the compact main-island revamp.
- The compact main island is pinned to 393 main-island land tiles, excluding the cemetery islet, down from the 592-tile baseline. This shrink must preserve the authored `56 x 56` map, current named DEWS sea-zone semantics, Ledger Mooring as the only non-DEWS named risk-water area, ship route semantics, same-origin `/api/*`, and the desktop gate.
- The lighthouse stays at `LIGHTHOUSE_TILE = { x: 18, y: 28 }` and visually rests on `overlay.lighthouse-headland`, the limestone outcrop drawn beneath it from `drawLighthouseHeadland`. The retired `overlay.central-island` diorama is no longer painted; the headland sprite plus the limestone-family land tile pack (`terrain.land`, `terrain.land-scrub`, `terrain.shore`) carry the central island ground.
- The eastern and southern coves keep Ethereum, Base, Arbitrum, Optimism, Polygon, and Mantle in preferred dock positions when those chains are rendered.
- Docks are capped by `MAX_CHAIN_HARBORS`; they reserve the Ethereum/L2 harbor cluster when present, then fill remaining slots by chain stablecoin supply.
- Ethereum's harbor may be selected as a dock, but its four-gate hub body must read as backgrounded water infrastructure with ships rendering over it.
- The Ethereum/L2 cove keeps `ETHEREUM HARBOR` and `L2 BAY` plaque signs readable without replacing named DEWS water-area labels.
- The cemetery remains a compact memorial precinct separated from the EVM bay and lighthouse approach.
- The inland civic spine does not host Pharos data buildings. Mint/burn flows, DEX liquidity, and redemption-route backstops stay on their dedicated analytical surfaces outside PharosVille.
- DEWS zone edge anchoring uses compound/coast-aware masks rather than rectangles:
  - CALM ANCHORAGE → x=0 large left-edge vertical basin
  - WATCH BREAKWATER → south breakwater basin plus the entire eastern shelf below the Alert ring
  - ALERT CHANNEL -> compact upper eastern-corner ring at (55, 0); no longer extends down the x=55 edge
  - WARNING SHOALS -> eastern-corner middle ring, bridged into Danger Strait
  - DANGER STRAIT -> eastern-corner inner/right storm ring
- The eastern corner is covered by overlapping ALERT/WARNING/DANGER water at the (55, 0) corner only
- Four-tile Chebyshev island periphery is reserved as generic water except for the Watch Breakwater shelf, which reaches the eastern coast
- Water tiles inside lighthouse visual clearance (x:14..24, y:23..32) stay generic water (lighthouse sprite breathing room)
- Ledger Mooring spans the entire top mooring shelf (y≤9, x≤30) and touches Calm Anchorage along the western flank at the y=9/y=10 boundary, sitting clear of Watch Breakwater and the eastern Alert/Warning/Danger ring without stealing their tiles. Freeze/blacklist tracker activity remains outside PharosVille and belongs to the `/blacklist/` product surface.

## Entity Semantics

| Entity | Meaning | Must not imply |
| --- | --- | --- |
| Lighthouse | PSI band and score | Full market health beyond PSI |
| Dock footprint | Chain stablecoin supply and top stablecoins on that chain | Bridge volume, transaction flow, or real-time transfers |
| Ship | Active stablecoin representative | Full supply distribution as linear pixel area |
| Ship route/docking cadence | Positive rendered-chain presence and risk-water patrol | Real transfer activity or issuer operations |
| Ship risk water | Peg/DEWS evidence, named risk-water area, risk zone, and placement precedence | Risk from stale or missing evidence alone |
| Dense active ship field | Individual active stablecoins sharing the current dense route budget, named risk-water areas, and risk zones | Aggregated issuers or hidden long-tail ship clusters |
| Cemetery marker | Dead/frozen lifecycle asset with cause-aware visual style | Active market status |
| Evidence caveat | Missing, stale, or low-confidence evidence | Confirmed depeg/stress |

## Ship And Risk Rules

- Ship class comes from governance/backing metadata via `ship-visuals.ts`.
- Ship size is a compressed market-cap tier, not linear area.
- Active depeg and DANGER evidence outrank calm chain presence for risk placement.
- Stale or missing peg evidence maps to an evidence caveat on Calm Anchorage fallback placement, not storm risk or a separate named zone.
- Fresh DEWS bands map to the named sea districts: CALM to Calm Anchorage, WATCH to Watch Breakwater, ALERT to Alert Channel, WARNING to Warning Shoals, and DANGER to Danger Strait.
- Ledger Mooring is the only non-DEWS named risk-water area. If ships can reference it, it must also have a printed label, area hit target, detail facts, and accessibility-ledger row.
- Printed water-area labels render above entity sprites and their hit targets win inside the printed label rectangle. This keeps all zone names visible and selectable even near tall landmarks.
- Reduced-motion representative placement uses deterministic static positions and no RAF loop.
- Reduced-motion ships freeze at risk-water idle tiles, or Ledger Mooring for NAV ledger assets. Details and the accessibility ledger must still expose the named risk-water area and risk zone.
- Normal motion samples, hit testing, selected rings, follow-selected behavior, and debug state must use the same motion model. Non-titan ships that are currently `moored` are not map-visible or hit-testable; titan ships remain map-visible while moored.
- Water routes must stay on water tiles where tests assert that contract.

## Renderer Rules

- Local runtime art comes from `public/pharosville/assets/manifest.json`; no generated remote URLs or prototype paths at runtime.
- Manifest assets must stay local PNGs with `critical` or `deferred` load priority, accurate dimensions, anchors, footprints, hitboxes, category/layer metadata, and prompt provenance when generated.
- The current v0.1 manifest budget is 35 total runtime assets (raised from 34 to fund the limestone tile-pack `terrain.land-scrub` variant); first-render/critical membership should stay narrow and justified by visible initial-frame need.
- The main-island revamp replaces existing island, lighthouse, and dock asset IDs in place. Keep critical/first-render membership stable unless a visible initial-frame need is documented.
- Hit boxes must track rendered geometry, not just tile centers.
- Asset geometry changes require manifest updates and hit-testing/visual validation.
- Canvas backing store must remain bounded by the canvas budget.
- Palette changes must pass `npm run check:pharosville-colors`; use the route palette and classification/shared colors rather than ad hoc debug colors.
- Per-zone water styling — base/depth/wave/accent colors, procedural texture kind, label outline/fill/plaque/accent, motion amplitude scalar, stroke-alpha scalar — is sourced from `ZONE_THEMES` in `src/systems/palette.ts`. Renderers must not re-introduce hardcoded zone color literals; pull from the theme. The `RISK_WATER_AREAS[area.riskPlacement].terrain` lookup is the canonical placement-to-terrain bridge that label rendering uses (the bare `${riskZone}-water` concatenation is wrong for Danger).

## Accessibility And Motion

- Reduced motion freezes animation while preserving static status encodings.
- Normal motion must use the single PharosVille canvas clock; independent
  analytical CSS animations, intervals, sprite loops, or minimap loops are not
  allowed.
- Motion priority is selected/focused entity, active risk or critical PSI,
  recent data change, then ambient life.
- Motion caps and debug fields are governed by
  [`MOTION_POLICY.md`](./MOTION_POLICY.md).
- Keyboard pan, Escape clear, toolbar controls, click selection, and blank-map click-to-close are part of the interaction contract.
- The detail panel and accessibility ledger must remain useful without reading canvas pixels.

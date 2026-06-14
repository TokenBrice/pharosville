# PharosVille Page

Contract for `https://pharosville.pharos.watch/`, the standalone beta PharosVille app.

PharosVille is served from the standalone root at `https://pharosville.pharos.watch/`. The `/pharosville/assets/` path is only the static asset namespace.

The scenery contract is recorded in
[`docs/pharosville/scenery-brief.md`](./pharosville/scenery-brief.md).
It defines PharosVille as a dark-first maritime observatory island-city: lighthouse
for PSI, harbors for chain supply, ships for active stablecoins, cemetery for
dead/frozen lifecycle assets, and named risk-water districts for DEWS,
stale-evidence, and NAV-ledger placement. Mint/burn flow and exit-route
telemetry are not encoded in PharosVille and remain available on their
dedicated product surfaces. Freeze/blacklist monitoring is
not encoded in PharosVille and remains available on `https://pharos.watch/blacklist/`. The ClaudeVille transfer boundary is
contracts and validation habits only: authored Canvas 2D layering,
sprite-manifest rigor, local asset loading, bounded motion, and screenshot
review discipline. Fantasy-village scenery, decorative lore copy,
non-semantic palettes, extra typography systems, ClaudeVille-specific entities,
and canvas-only data truth remain out of scope.

## App Contract

- **HTML and metadata shell:** `index.html`
- **React root:** `src/main.tsx`
- **App shell:** `src/App.tsx`
- **Viewport gate:** `src/client.tsx`
- **Desktop fallback:** `src/desktop-only-fallback.tsx`
- **Rotate fallback:** `src/rotate-to-landscape.tsx`
- **World shell:** `src/pharosville-world.tsx`
- **Route styles:** `src/pharosville.css`

`index.html` owns document metadata and the Vite entrypoint. `src/App.tsx` owns the screen-reader H1 and route error boundary. `src/client.tsx` performs the screen-size and orientation gate before mounting the browser-only world module.

PharosVille is a desktop-only experience. Mobile and tablet compatibility is explicitly out of scope: there is no responsive canvas layout, no touch-first toolbar, and no mobile-specific UX work. Screens whose long side is below `720px` or short side is below `360px` render a DOM fallback with links to the main analytical pages. Capable portrait screens show the rotate prompt. Until the gate passes, the app must not mount the canvas, world queries, runtime asset loader, or sprite/logo decode path. The HTML manifest preload may still occur because it is declared in `index.html`.

## Current Phase

The current implementation includes the desktop PharosVille v0.2.2 baseline:

- desktop-gated root app, with short-screen and narrow-screen fallbacks plus a rotate-to-landscape prompt for capable portrait screens
- route shell escapes the global page padding and sizes against the actual post-sidebar content pane, so the desktop canvas uses the full available viewport area whether the sidebar is expanded or collapsed
- executed visual revamp target: a dense dark-first maritime observatory diorama, using local pixel-art terrain, harbor, ship, lighthouse, and memorial sprites to make the existing Pharos stablecoin signals more legible without adding new analytical meanings
- Canvas 2D island-sea map on eligible desktop viewports, with the authored world reduced to `56 x 56` tiles and a compact main island so the first view reads as roughly 85.7-86.2% water while retaining authored coast, harbors, and lighthouse context
- authored terrain metadata layered over canonical movement tiles, including harbor water, calm DEWS anchorage water, watch breakwater water, alert water, warning shoals water, storm water, ledger water, deep outer-shelf water, beach, grass, rock, cliff, hill, and shore variants; manifest terrain sprites render first and semantic overlays add shoals, foam, current streaks, storm chop, ledger glow, and reef/buoy cues without changing analytical color meaning
- named DEWS water-zone labels attach to cartographic plaques, buoys, reefs, or breakwater markers on semantic water areas, with live band counts retained in details and the accessibility ledger, plus subtle dock mast flags using chain logos or short crest marks
- Pharos lighthouse placed on the generated island mountain at tile `{ x: 18, y: 28 }`, sitting on elevated terrain inside the central island silhouette
- the generated lighthouse asset includes its own limestone terrace, retaining wall, steps, and short road/causeway connector so the landmark reads as one integrated island district rather than a tower pasted onto procedural terrain
- Ethereum anchors the eastern cove with a selectable four-gate harbor-hub sprite drawn visually behind ship traffic, while Base, Arbitrum, and Polygon use reserved L2 extension slips around the eastern and southern coves when present; Optimism chain presence remains available in ship details but does not render a dedicated harbor; BSC, Tron, Solana, Aptos, and other non-core high-supply chain harbors use distributed outer-coast dock slots; generated harbor-ring quay sprites, compact piers, rollup causeways, quay pads, seawalls, posts, crates, lamps, buoys, ropes, skiffs, tents, and harbor clutter make the ports read as a continuous harbor ring, and the seawall blocks ship routing across the immediate coast-water ring instead of serving as decoration only; the cemetery sits on a separate bottom-left memorial islet
- live aggregate Pharos queries mounted only after the desktop gate, using same-origin `/api/*` paths served by the Pages Function proxy
- pure world model for PSI, docks, active ships, cemetery, named risk-water areas, details, and visual cues
- standard docks are capped to eight chain harbors, reserving the Ethereum/L2 harbor cluster first when those chains are present and then filling remaining slots by stablecoin supply; TON, when present, appends a separate detached dispatch wharf and does not consume the standard cap; each dock represents one rendered chain harbor, uses local harbor sprites with dedicated EVM-bay assets for Ethereum/Base/Arbitrum/Polygon, identifies itself with a small logo flag rather than a large name board, scales from both global share and absolute billion-dollar supply tiers, and lists that chain's highest-supply stablecoins in DOM details
- active ships use distinct local base sprites by governance class: CeFi treasury galleons, CeFi-dependent chartered brigantines, and DeFi DAO schooners, with legacy algorithmic junk and caravel fallback sprites reserved for defensive/unclassified cases
- ship scale uses exaggerated compressed market-cap tiers, not linear supply area, so $1B+ issuers are spottable while USDC, USDT, USDS, DAI, sUSDS, sDAI, stUSDS, USDe, sUSDe, PYUSD, USD1, and BUIDL receive dedicated titan-size hull treatments instead of linear supply area; the squad model has three independent squads, **Sky** (USDS flagship + sUSDS savings cutter + stUSDS vanguard icebreaker), **Maker** (DAI flagship + sDAI savings cutter), and **Ethena** (USDe flagship + sUSDe consort), that activate iff their own flagship is active and share that flagship's placement and route; a separate **Heritage hull** (unique) tier sits between titans and standard hulls and is curated by cultural significance rather than market cap — current members are crvUSD (Curve / llama), BOLD (Liquity / spartan), fxUSD (f(x) Protocol / mathematical livery), xAUT (Tether gold barge), PAXG (Paxos gilded merchantman), and USYC (Hashnote treasury vessel); each carries a dedicated sprite plus a "Cultural significance" rationale line in the detail panel and accessibility ledger
- reduced-motion routed ships freeze at their primary rendered dock berth with dock heading when available; NAV ledger assets keep Ledger Mooring, and dockless ships use their risk-water idle tile
- normal-motion ships follow slow deterministic water-only harbor cycles, with seeded detours between chain moorings and their peg/DEWS risk water; routed ships spend a base one third of their cycle moored, with an extended dwell for ships with at least four positive chain deployments, and non-titan, non-unique ships are hidden while moored so visible ship load rotates without dropping any ship from the world model
- DEWS-driven risk water areas follow the diagrammed sea-zone field: Calm Anchorage owns the large left-edge basin, Watch Breakwater occupies the south breakwater basin and reclaimed southeast corner basin, Ledger Mooring spans the entire top mooring shelf and touches Calm Anchorage along the western flank, and Alert Channel / Warning Shoals / Danger Strait form overlapping rings snapped to the eastern angled shelf; each area has its own terrain texture, printed label, selectable hit target, and live band counts in details and the accessibility ledger
- fresh ship risk water maps to Calm Anchorage, Watch Breakwater, Alert Channel, Warning Shoals, or Danger Strait; stale/low-confidence evidence stays as an evidence caveat on Calm Anchorage fallback placement, and NAV ledger assets use Ledger Mooring ledger water across the top mooring shelf. Normal-motion dockless patrols use current or adjacent same-purpose sea anchors so every risk zone has meaningful water-only travel
- ship docking cadence comes from `stablecoins.chainCirculating` chain presence, while risk water comes from `pegSummary.coins[]` and `stress.signals[]`; DOM details expose the route source, named risk water area, risk water zone, home dock, chain-presence count, and cadence text
- active ships use a tiered sail-emblem treatment: standard hulls draw a runtime SVG-logo overlay onto a logo-safe sail zone, while unique- and titan-tier hulls carry an iconographic silhouette painted directly into the mainsail (Curve llama, Tether kraken, Circle compass rose); secondary `ShipVisual.overlay` cues render as tiny lanterns, pennants, or signal flags rather than circular badges
- the current dense fixture processes all active stablecoins as individual ships with named risk-water placement and route facts; no ship-cluster targets are emitted in the current world, and normal-motion map-visible ship targets rotate as non-titan, non-unique ships dock
- dock sprites sit on quay pads, and non-data scenery is depth-sorted with entities, so supporting landmarks share the lighthouse's heavier island-city footprint while preserving entity IDs, hit targets, and DOM detail truth
- blacklist/freeze tracker activity is intentionally not represented in PharosVille; `https://pharos.watch/blacklist/` remains the product surface for those details
- data effects include bounded local glow, semantic water shimmer, and stale-data/ledger overlays; reduced motion freezes movement but keeps static status encodings
- the cemetery is rendered as a compact maritime memorial precinct with a pale limestone terrace, muted grass/quay edges, scattered grave placement, a dedicated local marker sprite set (headstone, ledger slab, reliquary marker, regulatory obelisk), small varied cause-aware marker scale/shape, contextual mausoleum/tree/shrub details, cause-of-death plaques using the shared cemetery legend colors, toned-down stone-mounted local logos only on selected or major memorials, and light atmospheric mist
- visible RPG-styled toolbar with zoom readout, time controls, reset, follow-selected, night, and auto-night controls; click-anchored detail panel; blank-map click-to-close behavior; and screen-reader accessibility ledger
- footer changelog link that opens a DOM panel populated from versioned, commit-collected PharosVille changelog entries, plus a throttled FPS/static-frame readout, with the Pharos link kept as the final footer item
- canvas hit testing for lighthouse, docks, ships, graves, and named water areas
- drag pan, wheel zoom, keyboard arrow pan, Escape/detail close, blank-map click clear, toolbar reset/follow/time/night controls, and fullscreen inspection mode
- normal-motion canvas loop for the lighthouse beam shimmer, semantic water textures, decorative time-derived dawn/day/dusk/night sky with sun, crescent moon, stars, constellations, cloud bands, decorative birds/lights/haze, and deterministic ship route sampling, with expensive wake effects capped to selected/top/recent ships
- printed water-area labels render above entity sprites so the names of Calm Anchorage, Watch Breakwater, Alert Channel, Warning Shoals, Danger Strait, and Ledger Mooring remain visible and selectable; label hit targets stay clear of the lighthouse asset rectangle
- deterministic reduced-motion render with no running animation frame loop
- route-owned motion debug fields for browser validation, including
  `motionClockSource`, `activeMotionLoopCount`, and capped `motionCueCounts`
- desktop, dense-atlas, stressed-ship, short-screen, ultrawide backing-store, interaction, central-core invariants, and motion visual coverage, including a p95 draw-duration budget for dense normal-motion rendering
- controlled local asset manifest v2 under `public/pharosville/assets/`, with the runtime inventory and critical/deferred split derived from `manifest.json` and enforced by `npm run check:pharosville-assets`
- asset validation through `npm run check:pharosville-assets`
- no production fixture/default market data

The compact main-island revamp preserves the current sea zones, ships, API
boundary, and desktop gate while reducing the main island from 592 to 377 land
tiles, excluding the cemetery islet. The lighthouse remains at `{ x: 18, y: 28
}` with the same visual-clearance box, and harbors are re-authored around the
smaller coastline.

## DEWS sea zones

Five DEWS zones encircle the island, with CALM/WATCH snapped to map edges and
the higher-risk bands drawn as overlapping eastern-corner rings sized roughly
proportionally to the ships they must host:

- **Calm Anchorage** — large left-edge vertical anchorage basin.
- **Watch Breakwater** — south breakwater basin plus the entire eastern shelf below the Alert ring.
- **Alert Channel** — compact upper eastern-corner ring at (55, 0).
- **Warning Shoals** — middle eastern shoal ring, bridged into Danger Strait.
- **Danger Strait** — inner/right storm strait snapped to the angled east edge.

The three escalation zones (ALERT + WARNING + DANGER) cover the eastern corner
with overlapping rings rather than hard rectangles. A four-tile Chebyshev
periphery around all island lobes and water tiles inside a lighthouse
visual-clearance box (x:14..24, y:23..32) remain generic water so zones don't
crowd the island or the lighthouse sprite.

**Ledger Mooring** is non-DEWS and spans the entire top mooring shelf for
NAV-ledger ships, touching Calm Anchorage along the western flank.

## Data Mapping Target

The planned PharosVille visual grammar is:

- lighthouse = PSI composite status
- dock footprint = reserved Ethereum/L2 harbor cluster plus remaining high-supply chain harbors, with one rendered harbor per chain, preferred cove slots for Ethereum/Base/Arbitrum/Polygon, no rendered Optimism harbor, distributed outer-coast slots for BSC/Tron/Solana/Aptos-style L1s, and absolute size floors for billion-dollar hubs so Ethereum, Base, Arbitrum-class ports read as major harbors
- dock harbor detail = highest-supply stablecoins on that chain, with the canvas flag using the chain logo or a fallback crest mark
- ships = active stablecoins only, with risk-water representatives, Ledger Mooring representatives where applicable, rendered-dock route visits for positive chain supply, and no current long-tail clustering
- ship base sprite = governance class (`centralized` CeFi, `centralized-dependent` CeFi-Dep, `decentralized` DeFi), with legacy algorithmic backing reserved as a fallback hull
- ship scale = exaggerated compressed market-cap tier from Micro/Unknown through Flagship, with special Titan hull treatments owned by `TITAN_SHIP_ASSET_IDS` and exact market cap exposed in the detail panel
- ship sail mark = stablecoin logo, falling back to a short symbol mark
- ship route distance from shore = peg/depeg risk first, with fresh DEWS escalation mapped from left/top calm/watch water into the eastern Alert Channel, Warning Shoals, and Danger Strait terrain while high-risk areas route around the island rather than underneath the lighthouse
- ship representative position and docking cadence = positive chain supply across the rendered chain harbors, shown as slow water-only passages rather than real-time transfer flow
- sea/weather = aggregate DEWS breadth, with evidence caveats for stale/low-confidence placement inputs, ledger water for NAV-ledger placement, and storm local textures for danger areas
- cemetery = dead and frozen assets from merged cemetery data, with each tomb marker using the local memorial marker sprite for its cause-aware shape, a stone-mounted local cemetery logo on selected or major memorials when available, and a cause-of-death plaque keyed to the same color taxonomy as the cemetery legend
- mint/burn flows, DEX liquidity, and redemption-route backstops = dedicated analytical pages outside PharosVille, not canvas landmarks
- evidence caveat = missing, low-confidence, or stale evidence, exposed in ship details and the accessibility ledger
- ledger water = NAV ledger assets, including assets that also have standard peg-summary or DEWS rows

Exact values and placement explanations must be available in DOM panels. The canvas must never be the only source of analytical truth.

Dense inspection concepts stay DOM-only until they have a clear analytical
mapping: full event/holding/pool/yield/dependency tables, transitive dependency
or value-at-risk interpretation, executable redemption guarantees, filtering and
sorting controls, and methodology text beyond short source or caveat labels.

## Canvas Exception

Pharos narrative visualizations normally prefer SVG/CSS view-model presentations. PharosVille is a deliberate Canvas 2D exception because it needs a pan/zoom world, isometric tile projection, depth sorting, sprite layers, culling, and 200+ possible entities.

Compensating gates:

- pure tested world model before renderer complexity
- DOM ledger/detail parity for encoded signals
- reduced-motion deterministic render
- canvas nonblank, semantic terrain/water, and backing-pixel budget tests
- no world canvas/runtime work when the device screen long side is below `720px` or short side is below `360px`
- no world canvas/runtime work while a capable screen is in portrait orientation
- no CSP relaxation

## Motion Budget

PharosVille motion is governed by one route-owned canvas clock. Normal motion
uses the world RAF loop in `pharosville-world.tsx`; reduced motion renders a
static deterministic frame and cancels the loop. Analytical motion cues must have
visual-cue registry metadata, DOM/detail or accessibility-ledger parity, and a
reduced-motion equivalent.

Priority order is selected/focused entity, active risk or critical PSI, recent
data change, then ambient life. Relationship overlays are
selected-only, ship wake/effects are capped to selected/top/recent-mover ships,
and ambient birds/lights remain fixed-size local sets attached to the lighthouse
or civic core.

## Visual Regression

The combined unit and visual regression suite covers:

- desktop canvas shell at `1440 x 1000`
- nonblank canvas pixels, terrain/water pixel coverage, and backing-store budget
- reduced `56 x 56` map size, 85.7-86.2% water ratio, deep-water
  perimeter cap, terrain metadata coverage, generated mountain lighthouse
  placement, 592-to-377 main-island land-tile shrink assertion, updated dock
  coastline assertions, lighthouse geometry assertions, harbor/cemetery
  separation invariants, and preserved named sea-zone semantics across
  `tests/visual/pharosville.spec.ts` and focused system/renderer unit tests
- dense atlas fixture with 8 rendered standard chain docks, optional detached TON dispatch wharf coverage when present, all 132 current dense-fixture active ships processed individually, rotating normal-motion visible ship targets, no ship-cluster targets, cemetery/civic/risk-water crops, and normal-motion draw-duration p95 budget
- stressed ship detail semantics for active depeg, Danger Strait/storm-shelf placement, named risk water, and evidence fields
- screen-size fallback for devices below the long-side/short-side gate
- portrait rotate prompt and short desktop fallback
- visible toolbar/detail surfaces, click-anchored detail placement, blank-map click-to-close behavior, and canvas click/selection/camera interaction
- fullscreen control visibility and mode toggle
- ultrawide canvas DPR/backing-store caps
- reduced-motion ship sample stability with no RAF loop
- normal-motion RAF startup, moving ship samples, moving ship click targets, and DOM/detail route parity
- absence of retired building targets, central civic-core placement invariants, visual-cue registry entries, and asset manifest validation
- no world API, site-data, canvas, sprite, or logo runtime requests under the fallback; the HTML `manifest.runtime.json` preload may still occur

Visual tests route-mock `/api/*` and `/_site-data/*` data before asserting map semantics.

## Color Guard

`npm run check:pharosville-colors` checks the PharosVille route shell for unsafe placeholder/debug colors and visual-system drift.

## Update Rules

Update this file when any of the following change:

- standalone app shell, metadata, or desktop gate
- PharosVille data mapping
- canvas mount, renderer, or world-model contract
- DOM parity, keyboard access, or detail-panel behavior
- visual regression expectations
- asset manifest or raster asset pipeline

Related docs to check in the same change:

- [README.md](../README.md)
- [AGENT_ONBOARDING.md](./pharosville/AGENT_ONBOARDING.md)
- [AGENT_ONBOARDING.md](./pharosville/AGENT_ONBOARDING.md)
- [TESTING.md](./pharosville/TESTING.md)
- [VISUAL_INVARIANTS.md](./pharosville/VISUAL_INVARIANTS.md)

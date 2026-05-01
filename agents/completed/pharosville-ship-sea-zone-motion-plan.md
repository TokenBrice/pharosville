# PharosVille Ship And Sea-Zone Motion Plan

Date: 2026-04-30
Status: Implemented through core rendering refinements
Scope: Standalone `pharosville` repository only
Canonical app: https://pharosville.pharos.watch/

## Objective

Refine how stablecoin ships interact with semantic sea zones so the canvas
better communicates risk placement, route cadence, and NAV-ledger behavior.

Top priority: NAV assets must visibly and semantically use Ledger Mooring.
Ledger Mooring should not be an empty decorative area while NAV stablecoins sail
only through Calm Anchorage or chain docks.

## Product Contract

- Ships preserve existing stablecoin, chain-dock, DEWS, and risk-placement
  semantics.
- `ledger-mooring` remains the non-DEWS risk-water area for NAV ledger assets.
- NAV ships hang at Ledger Mooring during normal motion and freeze there in
  reduced motion.
- Ship movement remains deterministic and water-only.
- Reduced-motion behavior remains static and does not start an RAF loop.
- Detail panel and accessibility ledger expose route source, risk water area,
  risk zone, dock cadence, and placement evidence.
- Visual motion cues stay bounded to analytical signals.

## Execution Tracker

### 1. Make NAV Placement Authoritative

Status: Done in `d463214`.

- [x] Route `meta.flags.navToken` to `ledger-mooring` even when peg-summary rows
  or stress rows exist.
- [x] Keep fresh active depeg as higher-precedence acute risk.
- [x] Preserve stale-evidence caveats in placement evidence.
- [x] Add unit coverage for NAV no-peg, NAV peg-row, NAV fresh DEWS, and NAV
  active-depeg precedence.

### 2. Add Ledger Mooring As A Real Route Stop

Status: Done in `2ee36f1`.

- [x] Add semantic route stops distinct from chain dock stops.
- [x] Keep Ledger Mooring as a risk-water ledger stop with no chain identity.
- [x] Ensure NAV route cycles include Ledger Mooring dwell.
- [x] Keep reduced-motion NAV samples static at ledger water.
- [x] Keep chain dock visitation intact for NAV ships with rendered docks.
- [x] Expose route-stop identity in debug motion samples.
- [x] Update tests and intentional visual snapshots.

### 3. Keep Semantically Important Ships Individual

Status: Already satisfied by prior no-cluster model work.

- [x] Dense fixture exposes individual ships instead of `ship-cluster` targets.
- [x] Visual and accessibility tests assert no cluster rows/targets.
- [x] Ledger-moored NAV ships stay visible even when non-titan moored at the
  semantic route stop.

### 4. Add Zone-Aware Path Costs

Status: Done in `17dbd73`.

- [x] Pathfinding scores semantic water terrain by ship risk zone.
- [x] Calm and ledger routes prefer calm/ledger/generic water over storm shelf.
- [x] Warning and danger routes can use rougher routes.
- [x] Route cache keys include zone so zone-specific costs do not collide.
- [x] Add representative water-only deterministic route tests.

### 5. Expose Current Route Phase In Details And Debug

Status: Done in `2ee36f1`.

- [x] Add `currentDockId`, `currentRouteStopId`, and `currentRouteStopKind` to
  compact debug motion samples.
- [x] Keep detail panel on stable route facts instead of frame-dependent noise.
- [x] Add detail and accessibility coverage for Ledger Mooring route facts.

### 6. Add Zone-Specific Wake And Drift Style

Status: Done in `17dbd73`.

- [x] Derive wake style from motion sample zone.
- [x] Use quieter gold ledger wake, restrained calm wake, and stronger rough-zone
  wakes.
- [x] Keep wake effects capped to selected/effect/recent-mover ships.
- [x] Preserve reduced-motion static rendering.

### 7. Add Anti-Crowding Lanes For Risk Zones And Docks

Status: First pass done in `17dbd73`.

- [x] Add deterministic per-ship transit lane offsets that fade out near route
  endpoints.
- [x] Keep sampled positions bounded and visually water-only.
- [ ] Consider a later visual pass for dock-approach lane spacing around the
  densest harbors if crowding remains noticeable.

## Validation Run

Tranche validations completed:

```bash
npm test -- src/systems/risk-placement.test.ts src/systems/pharosville-world.test.ts
npm test -- src/systems/motion.test.ts src/renderer/hit-testing.test.ts src/components/accessibility-ledger.test.tsx src/systems/detail-model.test.ts
npm run typecheck
npm run check:pharosville-colors
npm run test:visual
```

Full final validation remains before handoff:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

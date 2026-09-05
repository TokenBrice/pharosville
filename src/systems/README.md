# PharosVille Systems

The `systems/` directory owns the pure data-to-world layer for the standalone PharosVille app. Prefer adding semantics here before touching the renderer.

## Primary Flow

1. `pharosville-desktop-data.tsx` gathers existing Pharos API payloads after the desktop viewport gate.
2. `pharosville-world.ts` builds a deterministic `PharosVilleWorld` from those payloads.
3. `world-layout.ts`, `garden-fleet-placement.ts`, and `garden-sea-regions.ts`
   define the authored map, terrain classification, full-fleet placement,
   lighthouse clearance, water bodies, docks, wreckyard, and helper lookups.
4. Specialized modules derive route-local entities:
   - `chain-docks.ts` builds top-chain harbor docks.
   - `risk-placement.ts` resolves ship risk placement from peg/DEWS/report-card evidence.
   - `ship-visuals.ts` resolves hull, class, pennant, overlay, and market-cap size tier.
   - `motion.ts` builds deterministic ship routes and frame samples.
   - `detail-model.ts` creates DOM detail models for every selectable entity.
   - `visual-cue-registry.ts` records visual cues, source fields, and DOM equivalents.

## Boundaries

- Keep these modules pure and deterministic. Avoid DOM, canvas, timers, browser globals, and network calls.
- One deliberate exception: ship placement is sticky. `stages/ship-placement.ts` and
  `stages/dock-assignment.ts` carry the previous build's risk tiles and berths, so the
  world is deterministic given *(inputs, previous placements)* rather than inputs alone.
  A ship keeps its tile while its risk placement is unchanged, which keeps its A* path
  keys and stops the fleet teleporting on refresh. Tests that need a cold build call
  `resetHeldShipPlacements()` and `resetHeldMoorings()`.
- Berths guarantee unique water-safe centers, with held positions claimed
  before newcomers. The existing local search prefers nonoverlapping
  dock-facing family envelopes when space allows; crowded local candidates
  minimize squared hull penetration before distance to the quay. It retains
  the original unique, point-safe whole-map fallback. Envelopes are a
  composition preference, not permanent reservations for every potential
  visit: temporal overlap remains possible. The family approximation does
  not encompass every loaded hero model or animated yaw. Dock/risk labels and
  route ownership remain unchanged.
- The complete planned voyage is displayed without a separate distance cap.
  Sailing, arrival and departure share harbor-apron clearance, avoiding a
  position jump when the sample changes phase. Solid land clearance remains.
- Use shared runtime-neutral helpers such as `getCirculatingRaw()` and `@shared/*` imports instead of route-local copies of shared logic.
- Keep source-field provenance with any visual cue that represents analytics.
- Keep route-specific visual semantics here; shared scoring/methodology logic belongs in `shared/lib/` only when it is a real cross-route contract.
- Use `stable-random.ts` for deterministic scatter and seeded placement, not `Math.random()`.
- Reduced-motion samples settle directly at authored risk anchorages (Ledger
  Mooring retains its representative stop); squad offsets remain relative to
  the flagship. Renderer, hit targets and details use the same display sample.

The render-loop sea-room pass runs after route smoothing and garden placement.
It writes the final `ShipMotionSample.displayTile` shared by rendering, hit tests,
following and debug positions; the semantic route tile stays unchanged. Hull
length and beam come from the water-clearance envelopes. Persistent detours yield
to fixed moored vessels, stay within eight tiles of the route, and move at most
1.2 tiles/second (0.15 tiles per frame). Only clear vessels ease back to their
route. Water checks reject unsafe steps; berth-distance taper returns detours to
zero at docking. Final displacement supplies follow velocity; the route-smoothed
heading stays unchanged so collision-tested hulls cannot turn broadside afterwards.
This is soft local avoidance: formation children remain attached to parents,
moored overlaps require berth allocation, and reduced motion remains canonical.

## Common Extension Points

| Goal | Start here | Notes |
| --- | --- | --- |
| Change map geography | `world-layout.ts`, `garden-fleet-placement.ts` | Preserve sea-first composition, lighthouse clearance, harbor waterline, wreckyard, and water classification unless intentionally changing them. |
| Change dock semantics | `chain-docks.ts`, `pharosville-world.ts` | Docks mean top-chain stablecoin supply, not transfers. |
| Change ship hull or size | `ship-visuals.ts`, `unique-ships.ts` | Size is compressed market-cap tiering. |
| Change risk placement | `risk-placement.ts`, `pharosville-world.ts` | Active depeg/fresh DEWS precedence matters; stale/missing evidence must not become storm risk. |
| Change movement | `motion.ts`, `garden-fleet-placement.ts` | Motion samples must stay water-safe and aligned with hit testing. |
| Add a visual cue | `visual-cue-registry.ts`, `detail-model.ts` | Include source fields and DOM equivalent text. |

## Focused Tests

```bash
npm test -- src
npm test -- src/systems/world-layout.test.ts
npm test -- src/systems/motion.test.ts
npm test -- src/systems/risk-placement.test.ts
npm test -- src/systems/visual-cue-registry.test.ts
```

Use `docs/pharosville/TESTING.md` to choose scenario-specific checks.

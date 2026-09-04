# Harbor change surface and budget — Lane F (2026-09-04)

Recovered from the Lane F agent delivery (`agent://LaneFBudget`); the agent reported writing
this path but the file was not persisted, so the orchestrator materialised it from the
delivered payload. Measurements were produced by read-only `npx tsx --eval` runs over
`authorDock` + `createGardenHarborBatch` on the real dense feed, cross-checked against the
committed census.

## 1. Coupling surface — two production files plus ~10 test files

Positions are authored ONLY in `RIM_COVES` (`src/systems/garden-rim.ts:115-146`) and bound
to chains/types ONLY in the slot tables (`src/systems/world-layout.ts:82-146,187-206`).
Selection is `ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS` (`world-layout.ts:67`) +
`MAX_CHAIN_HARBORS` (`src/systems/chain-docks.ts:14`) + `PREFERRED_DOCK_STATIONS` fill
order.

Side couplings:

| Consumer | Lines | What it does with the value |
| --- | --- | --- |
| ship-water exclusion | `src/systems/garden-water-exclusion.ts:111-115` | circles every `DOCK_TILES` entry at r = 2.2 |
| rim-mesh cove carving | `src/three/garden-rim-mesh.ts:248-252,517-520,777-790` | carves the mouth and clears paths/pines/stones by cove width |
| sea-edge siting clearance | `src/systems/garden-sea-edge-sites.ts:248-251` | keeps steles clear of `RIM_COVES` |
| graves / ledger clearance | `src/systems/world-layout.test.ts:398`; `risk-water-areas.test.ts:164` | asserts > 3.25 tiles from every grave |
| runtime-facts generator | `scripts/pharosville/generate-runtime-facts.mjs:237-244` | scrapes `PREFERRED_DOCK_TILES` into published docs |

Flow: `RIM_COVES` → `cove()` lookup → `EVM_BAY_STATION_SLOTS` / `OUTER_HARBOR_STATION_SLOTS`
→ `PREFERRED_DOCK_STATIONS` / `PREFERRED_DOCK_TILES` → `stationSlotForChain` →
`DockNode.station` → `authorDock` / `displayTile` → `createGardenHarborBatch` world-wide
buckets. Moving a mouth is therefore a two-file edit plus ~8 test files.

## 2. Dead constants and tautological pins

- `SOLANA_HARBOR_DOCK_TILE` is referenced only by its own definition
  (`src/systems/world-layout.ts:122`).
- `BASE_HARBOR_DOCK_TILE` / `HYPERLIQUID_HARBOR_DOCK_TILE` are consumed only by tautological
  index pins (`world-layout.test.ts:282,287`) that compare an array element to the constant
  derived from that same element.

Both the pins and the three tile constants are clean-deletion candidates under repo policy.

## 3. Gate surface, classified

**Preserve:** the rim-spread contract test (`chain-docks.test.ts:152-245`, implementing the
`VISUAL_INVARIANTS` spread sentence); cove geometry gates
(`world-layout.test.ts:279-323`; `garden-rim.test.ts:226-264`); silhouette minimums and
"Ethereum largest, sole bell tower" (`garden-docks.test.ts:57-89,131-143`); the ≤20-drawable
batch gate (`garden-harbor-batch.test.ts:60-66`); LOD-name shedding gates
(`garden-overview-lod.test.ts:77-88`; `world-renderer.test.ts:854-883`); the water-exclusion
mirror test (`garden-water-exclusion.test.ts:289-293`); berth locality ≤20 tiles
(`dock-assignment.test.ts:29,92-99`); the pigeonnier ninth-dock gates
(`chain-docks.test.ts:368-421`; `world-layout.test.ts:165-168`); and the browser-level
rendered-dock-id list (`tests/visual/pharosville.spec.ts:384-395`).

**Amend (operator call):** the precinct exemption sentences; the 12-cove / 8-harbor count
pins if mouths or cap change; the connected-precinct bridge sentence if the Ethereum Mole
re-architects; the 7.2–12.4 second-level span range.

**Delete:** the tautological index pins in §2.

## 4. Measured cost

9-station ring = **13,324 triangles** total (10,688 coarse at default framing, 2,636
hover-only fine) in **11 coarse + 3 fine draws**. Harbor total ownership is ~18 of the 256
default draws (batch 10–11 + cargo-tide 1 + tide-line 2 + lanterns 2 + districts 2) and
~4.0% of 335,105 triangles.

Per-archetype solo (coarse + fine): precinct 1,688 · salvage-slip 1,500 · reed-boathouse
1,362 · tea-house-quay 1,336 · storm-mole 1,330 · signal-jetty 1,328 · fishing-pier 1,332 ·
annex-pavilion 1,192 · pigeonnier-islet 1,200 · stepped-inlet 1,046 · gate-landing 950.

Marginal per station in-ring: precinct 3,368 (carries all three bridges), annexes 1,576–2,020
(each owns a bridge), others 1,046–1,500. A ninth station (TON) added **+1,188 triangles and
+0 draws**.

Draw cost is bucket-quantised: 7 material buckets × {coarse, fine} + 7 prop kinds ×
{coarse, fine} + 1 flag cloth, merged world-wide. **Station count and size do not move draw
calls.**

## 5. Headroom

To the hard ceilings, above the recorded default (256 / 335,105 / 230 / 43):
**444 calls, 164,895 triangles, 270 geometries, 29 textures.**

Per-station triangle budget for a 9-station ring before the ceiling binds: 18,322 extra
triangles per station, i.e. **~19,802 total per station — about 13.4× the current ~1,480
mean.** At 2× detail the ring costs ~26,648 triangles (frame ~348,429, 70% of ceiling); at
4×, ~53,296 (frame ~375,077, 75%). Both are trivially affordable.

Because draws and geometries stay flat under enlargement, the real binding gates are the
≤20 ring-row census gate, the silhouette minimums (which enlargement only helps), and the
"Ethereum tallest / 7.2–12.4 span" relative-size sentence.

## 6. Verification recipe

```
npm test -- src/systems/chain-docks src/systems/world-layout src/systems/garden-rim \
  src/systems/garden-water-exclusion src/systems/risk-water-areas \
  src/systems/garden-sea-edge-sites src/three/garden-docks src/three/garden-harbor-batch \
  src/three/garden-overview-lod src/three/world-renderer \
  src/systems/pharosville-world/stages/dock-assignment
npm run typecheck
npm run docs:runtime-facts && npm run check:runtime-facts   # if cap or IDs changed
npm run validate:changed
```

Playwright lanes are correctness-only (SwiftShader): `npm run test:visual` for dock
deep-link and ledger parity.

**Cannot be verified without the operator's real-GPU preview** (`env -u CI npm run preview`):
silhouette nameability, reconciled `--draw-census` ring rows, frame pacing (`--assert`),
night one-light/ember balance, the 16px blurred-frame emptiness audit, and
`npm run test:perf:reference`.

## 7. Tooling bug to fix in passing

`generate-runtime-facts.mjs:238` scrapes `PREFERRED_DOCK_TILES` with an object-literal
regex. Since that export became `Object.fromEntries` (`world-layout.ts:149-151`), the regex
slides to a later `= {` block and `RUNTIME_FACTS.md` emits junk — observed live as
`Preferred chain IDs: x, cove, id, body, tile, seawardBearing, width, type`. The check gate
passes because it only compares generator output to the committed file, so a broken
extraction is self-consistent. Any harbor change that regenerates runtime facts must fix or
drop that fact.

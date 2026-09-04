# Implementation audit — harbor redistribution (2026-09-04)

Findings from the `F3Audit` reviewer session (`history://F3Audit`), materialised by the
orchestrator because that session is sandboxed to read-only tooling and could not create its
own report. Every line below is the reviewer's finding with its cited evidence; the
disposition notes are the orchestrator's.

**Audited state:** commits `3c1890d` (ring + roster), `b498eb3` (footprint + ghost moorings),
`f1b7a85` (Mole + copy). Audited against `agents/epic-harbor-plan.md` §10 acceptance and §12
outcomes.

## 1. Per-phase acceptance

| Phase | Verdict | Evidence |
| --- | --- | --- |
| 0 — Contract | **partial** | `AGENTS.md` path fix and the `VISUAL_INVARIANTS.md` amendments landed. But `src/systems/visual-cue-registry.ts:225-234` still registered the old precinct / L2-annex / covered-bridge contract, including a reduced-motion bridge-lantern cue, after both producers were deleted. |
| 1 — The ring | **met** | `RIM_COVES` `src/systems/garden-rim.ts:123-143`; one EVM slot + seven outer `src/systems/world-layout.ts:74-114`; cap `src/systems/chain-docks.ts:14`; id normalization `world-scaffold.ts:398-446`; cargo scope `cargo-tide.ts:189-195`. |
| 2 — Systems | **partial** | Leg cap, calm mask, camera, risk, sea-edge and rim-mesh consumers all landed. But `DockNode.station` exposes no footprint, and `src/systems/dock-layout.ts:75-86` understates the Mole — see §4. |
| 3 — The Mole | **met** | `src/three/garden-docks.ts:652-770`, pinned at `garden-docks.test.ts:229-271`. Measured 1,292 triangles in 8 draws. |
| 4 — Identity | **partial** | Nine types, the ladder, and the DOM/UI copy all landed. But the station accent bucket remained a fixed `#ad3f2f` at `garden-docks.ts:326`, so the computed per-chain accent reached only the flag cloth and the recipe metadata — never the architecture. |

## 2. §12 outcome table — verified by construction, not guarded by tests

The reviewer confirmed the **authored constants support every claim**: 49° max closed-rim
empty arc, 0 trios within 30 tiles, 2 of 8 west-arc mouths, 0 other stations within 30 tiles
of Ethereum, 63% Mole-to-Pharos height, 1.21× lead over the largest ordinary station, 0 of 36
archetype pairs within 10% on both axes, and station count 9.

**The gap worth recording:** the test suite does *not* independently assert the closed-rim
49°, the prior 111°, the old 19-of-55 pair collisions, or dense rendered-length ordering.
Those four numbers are therefore **verified by construction rather than guarded by a test**,
which means they could silently rot under a future edit. The orchestrator's own scripted
verification and Lane V's real-module run establish them today; nothing re-checks them on
every commit.

## 3. Invariant compliance

| Invariant | Verdict | Evidence |
| --- | --- | --- |
| Ember lane budget (16 lanes, 8.5-unit separation, 0.38 gain) | **safe** | `src/three/garden-lanterns.ts:62-88` caps at 16, enforces the 8.5-unit separation and applies the gain. Nine stations' approach-lamp candidates can exceed 16, but the registry thins rather than burning them all — which is the sanctioned behaviour (thin a crowd before dimming any one lamp). |
| Procedural-geometry ownership | **met** | The Mole is fully procedural; no GLB was introduced (plan §2 D2). |
| Analytical DOM/ledger parity | **met** | Detail panel and ledger strings derive from `dock.station.type`; new archetypes gain parity automatically. |
| Measured resource ceilings | **not established** | Only the Mole was measured (1,292 tri / 8 draws). The whole-layer baseline has NOT been remeasured since the redistribution, so the recorded ~256 draws / 335,105 triangles / 230 geometries / 43 textures can no longer be assumed to describe this world. |

## 4. Merge blockers found

1. **The Mole's clearance envelope is undersized.** `dock-layout.ts:75-86` reports the Mole
   as 24 × 10 — its *hall* — while the authored geometry spans roughly local x −23..17 and
   z ±14, i.e. about 40 × 28, because §5 wraps the hall in a 26 × 10 apron, an 18 × 14 basin
   and arms projecting 22 and 15. Every scenery and risk consumer reads `stationFootprint`,
   so all of them were keeping out of a box less than a quarter of the monument's true area.
2. **Per-chain accent never reached the architecture** (`garden-docks.ts:326`).
3. **`visual-cue-registry.ts:225-234` advertised deleted structures**, including a
   reduced-motion bridge-lantern cue — a parity claim the renderer cannot honour.

*Disposition: all three were assigned and fixed in the Fidelity wave — `A1MoleEnvelope`,
`F1Fidelity` (re-steered to target the accent bucket specifically), and `A2VisualCues`.*

## 5. Deliberate divergence from the plan's stated shape

`DockNode.station` exposes no `footprint` field; clearance consumers derive the envelope from
the authored slot tables instead. Functionally equivalent and it keeps the renderer out of the
systems contract, but it diverges from the plan's stated shape and is recorded here as a
deliberate divergence rather than a defect.

## 6. Residue

Retired identifiers survive **only in historical comments** — `world-layout.test.ts:294-296`
and `garden-docks.test.ts:18-20` — with no live values, exports or bindings. `agents/**` and
`docs/**` legitimately name them in planning and history.

## 7. Remaining work at audit time

- **Phase 5:** §7 ranks 1–6, the cruise-visible void/ironwork split, census reconciliation,
  and visual acceptance.
- **Phase 6:** the full gate run plus the operator's real-GPU previews.
- **Phase 7:** scratch cleanup under `outputs/`.
- **Deferred by the plan, not missing:** rank 7's texture atlas, the attract postcards, and
  the optional concentration sharpening.

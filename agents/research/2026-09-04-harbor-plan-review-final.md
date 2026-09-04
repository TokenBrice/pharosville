# Final review of `agents/epic-harbor-plan.md` — Lane R2 (2026-09-04)

Recovered from the Lane R2 reviewer delivery (`agent://FinalReview`, transcript
`history://FinalReview`); findings were delivered as structured output rather than a file,
so the orchestrator materialised them here.

**Reviewed revision:** the final 8-mouth / cap-8 design (after the eight prior findings in
`2026-09-04-harbor-plan-review.md` were applied and the ring was cut from 10 mouths to 8).
**Verdict at that revision: incorrect / not implementation-ready** (confidence 0.99).

> The final plan is not implementation-ready. Its coverage acceptance is internally
> impossible without the Ethereum precondition, and its footprint guard crosses the
> systems/renderer ownership boundary; the type cutover also omits concrete consumers, while
> the outcome table retains one stale triangle range. The other six prior-review concerns
> are correctly resolved, and the light, procedural-ownership intent, alert-body loss,
> signal-mast distinction, pigeonnier count, and measured resource ceilings are otherwise
> coherent.

## Findings

### P1 — Scope the ring-coverage gate to selections containing Ethereum (confidence 0.99)

§4 explicitly says the eight-mouth guarantee requires a selection containing `ethereum`,
because without it the EVM-only Mole stays empty and at most seven outer docks render
(§4, lines 204-210). §9 nevertheless required all eight mouths for "any eight-chain
selection", and §12 claimed all four arcs are inhabited "in every feed" even though §3 says
sparse feeds render fewer stations. Following the §9 gate literally creates an impossible
acceptance test. Carry the Ethereum precondition into §9, scope the §12 outcome to the dense
eligible fixture, and do **not** amend the existing north limit to an unconditional "exactly
one" for sparse feeds.

### P1 — Keep station footprints in the systems layer (confidence 0.99)

R4 required `risk-water-placement` and `garden-sea-edge-sites` to consume a rectangle
derived from renderer-owned `DockRecipe.footprint`. That reverses the documented boundary:
`docs/pharosville/THREEJS_AGENT_REFERENCE.md:9-12` assigns placement and risk semantics to
`src/systems/`, while `garden-docks.ts` owns presentation recipes. It also ordered the
systems cutover in Phase 2 before the new Mole recipe is authored in Phase 3. Define the
authoritative oriented footprint on the system-side station slot/node contract, use it for
exclusion/risk/scenery there, and have `authorDock` consume or verify the same dimensions
rather than making `src/systems` depend on `src/three`.

### P2 — Include the authoritative dock type and batch fixtures in the cutover (confidence 0.98)

"The same registry list as Phase 3" is not complete. The authoritative
`DockNode.station.type` union independently lists all four retired names
(`src/systems/world-types.ts:410-421`), and `src/three/garden-harbor-batch.test.ts:11-18`
has separate nine-dock and all-archetype fixture rosters containing `boathouse-precinct`,
`annex-pavilion`, `salvage-slip` and `signal-jetty`. §9 named only the roster in
`garden-docks.test.ts`, while Phase 3/4 named neither. Add `world-types.ts` and both batch
rosters to the explicit cutover list, along with the `src/three/__fixtures__/harbor.ts:33`
rename, so implementers do not stop after the renderer-local registries.

### P2 — Report the Mole's nine-thousand-triangle outcome in the summary (confidence 0.97)

§5 budgets the Mole at ≤9,000 triangles, but §12 summarised the delivered per-station range
as only "~2–6k". The Mole is one of the nine stations and is explicitly outside the ordinary
scale ladder, so the outcome table understated the planned maximum and no longer matched the
implementation acceptance bound. Qualify the 2–6k range as the eight ordinary stations and
add the Mole's ≤9k figure.

## Explicitly cleared

- **No additional `VISUAL_INVARIANTS` conflict beyond §9.** The existing lane cap and
  8.5-unit ember separation already handle the ring's ~18 approach-lamp candidates.
- **`signal-jetty` the archetype is not `garden-signal-mast.ts`**, the island precinct prop;
  the plan does not conflate them and no invariant names the archetype.
- **The pigeonnier gates stay valid unchanged** — 8 standard docks + TON is still the ninth
  dock, so `chain-docks.test.ts:368-385,408-426` need no amendment.
- The six other prior-review findings are correctly applied; light budget, procedural
  ownership, the `alert` body loss, and the measured resource ceilings are coherent.

## Disposition

All four findings applied by the orchestrator: the §9 gate now carries the `ethereum`
precondition and states sparse-feed behaviour; §9 amendment 6 keeps the north limit a
maximum; R4 and Phase 2 now define `stationFootprint(slot, size)` in
`src/systems/dock-layout.ts` with the renderer asserting against it; Phase 3's rename list
gained `world-types.ts:410-421`, both batch rosters and the fixture; and §12 now reports
~2–6k for the eight stations plus ≤9,000 for the Mole.

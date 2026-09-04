# Review of `agents/epic-harbor-plan.md` — Lane R (2026-09-04)

Recovered from the Lane R reviewer delivery (`agent://LaneRReview`, transcript
`history://LaneRReview`); the findings were delivered as structured output rather than a
file, so the orchestrator materialised them here to keep the plan's evidence trail intact.

**Reviewed revision:** the pre-rewrite draft (10 authored mouths, `MAX_CHAIN_HARBORS`
raised to 10, `hatago-wharf` as a second new archetype, `arbitrum` on `signal-jetty`).
**Verdict at that revision: incorrect / not implementation-ready** (confidence 0.98).

> The plan is not implementation-ready: it omits an active second bridge/causeway producer
> and stale UI/browser consumers, contains incompatible scale and archetype cutover
> instructions, and does not balance the two-station density increase against the
> repository's attention-displacement contract. Its risk register is also incomplete and
> leaves several key guards asserted rather than specified.

## Findings

### P1 — Delete the separate Ethereum causeway system (confidence 0.99)

D1 requires no bridges or related furniture after the L2s disperse, but Phase 3 removed only
`authorPrecinctBridge`. `createGardenHarborDistricts` independently finds Ethereum plus the
L2 chain IDs, authors stone causeways and two lanterns per route, and registers route lanes
(`src/three/garden-harbor-life.ts:300-344,620-661`). Because the chain IDs still exist,
those links would span the redistributed map unless this consumer and its tests are
explicitly removed.

### P1 — Define one scaling rule that preserves the Mole lead (confidence 0.99)

§5 fixed the Ethereum hall at 24 × 10 and the envelope at 40 × 34, while §6 said every
rendered length is the base times a 0.95–1.35 supply multiplier and claimed Ethereum remains
largest under every combination. Under that stated rule Ethereum could be 22.8 units while
Tron's 19-unit base reached 25.65, reversing the claimed lead; Ethereum could also reach
32.4 rather than the 24-unit maximum reported in §12. Either exempt the Mole from supply
scaling or recompute the ladder, envelope, and outcome claims.

### P1 — Include the `ethereum-mole` type in the archetype cutover (confidence 0.98)

The binding and scale ladder require `ethereum-mole` as a `StationType`, but the phases only
replaced the `boathouse-precinct` author in Phase 3 and added new types in Phase 4.
Following those instructions leaves no `ethereum-mole` union member or identity entry for
the slot table, making the claimed archetype count impossible. Specify that
`boathouse-precinct` is renamed across every type-indexed registry and fallback.

### P1 — Cut the two-station density increase or name its displacement (confidence 0.94)

The plan increased the rendered ring from 8+TON to 10+TON while enlarging stations and adding
panelization, but its displacement ledger covered only the Mole and relabelled two annex
removals as displacement for two replacement archetypes. It never named what the two net-new
stations, their four approach lanterns, lit quay edges, windows, and added architectural
detail displace, contrary to `docs/pharosville/VISUAL_INVARIANTS.md:247-251`. Mouth spacing
and the 16-lane runtime cap do not restore the attention or empty-water budget.

> The defensible cut is the proposed `MAX_CHAIN_HARBORS` increase: keep ten authored mouths
> as the placement pool but retain the cap of eight, accepting the plan's own 66° fallback
> rather than making the garden denser everywhere.

### P1 — Update the non-derived harbor copy and rendered-ID gate (confidence 0.99)

Phase 4 said detail-panel and ledger strings derive automatically, but the visible legend
hard-codes the old connected precinct (`src/components/legend-panel.tsx:225-232`) and its
test pins that wording (`src/components/legend-panel.test.tsx:12-17`). The browser gate also
hard-codes exactly the current eight dock IDs
(`tests/visual/pharosville.spec.ts:384-395`), yet §9 listed that gate under "Preserve"
rather than amending it for additional rendered chains. If shipped as a versioned release,
also include the three synchronized release records required by
`docs/pharosville/RELEASES.md:5-9,26-31`.

### P2 — Extend footprint clearance beyond fleet placement (confidence 0.91)

R4's guard covered ship exclusion and risk anchors only, but two other geometry owners still
clear against the cove mouth/width rather than the enlarged station footprint: sea-edge sites
use distance to `RIM_COVES` (`src/systems/garden-sea-edge-sites.ts:240-251`), and rim paths,
pines, stones, and bay excursions use cove-width clearance
(`src/three/garden-rim-mesh.ts:248-252,517-520,777-805`). With every station enlarged and the
Mole reaching 40 × 34 world units, L2 + L11 cannot establish that scenery and rim dressing
remain clear.

### P2 — Correct the Ethereum-neighborhood outcome metric (confidence 0.99)

§12 reported "stations within 30 tiles of Ethereum 4 → 0", but the Ethereum station itself is
at distance zero, so the post-change count cannot be zero. §1 also put the unrelated text
"0 trios anywhere" in that metric's Target cell. Use one consistent metric.

### P2 — Complete the risk register and replace asserted guards (confidence 0.97)

The requested 11-risk audit could not be completed because §11 contained only R1–R10.
Several guards merely deferred the decision: R1 and R3 relied on a future blur audit without
an objective failure threshold, R4 pointed to L11 whose fix was still "feed footprints … or
nudge", and R7 set no coarse-tier triangle ceiling. By contrast R2, R5, R6, R8, R9 and R10
named executable guards.

## Disposition

All eight findings were applied by the orchestrator. The density finding was resolved more
aggressively than recommended: rather than keeping ten mouths at cap 8 and accepting a 66°
hole, the ring was cut to **8 authored mouths at cap 8**, which measures the same 49° spread
as the cap-10 design with the station count unchanged at 9 — so the density increase was
removed entirely rather than traded against spread. See `epic-harbor-plan.md` §2 D5 and §3.

Because §§3–6 and §§9–12 changed materially after this review, a second review pass against
the final revision is required; this document covers the pre-rewrite draft only.

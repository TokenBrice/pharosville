# Fleet density strategy

## 1. Noon frame: estimated hull density

This is a visual estimate from `outputs/reborn/noon.png`, not a programmatic census. I counted a hull in the frame-ninth containing its apparent centre; overlaps, shoreline occlusion, tiny craft and grid-line cases make the total approximately **78 ±15 visible hulls** even though the product tracks about 185.

| Frame ninth | Left | Centre | Right |
| --- | ---: | ---: | ---: |
| Top | 10 | 8 | 8 |
| Middle | 12 | 5 | 8 |
| Bottom | 5 | 10 | 12 |

The distribution is not merely high; it lacks a quiet governing field. The island suppresses the middle-centre count, while the left and lower-right masses compete around it. This confirms the critique that completeness has been confused with simultaneous visibility (`agents/pharosville-reborn/reviews/astra-ruthless-critic.md:13-19`). Placement already diagnoses uniform coverage as a carpet and names negative space as the composition (`src/systems/garden-fleet-placement.ts:26-55`), but retaining every hull prevents that diagnosis becoming a hard presentation budget.

## 2. Position: 48 at rest, 60 only as a hard attention ceiling

**Show a curated base fleet of 48 hulls at rest.** Forty is a valuable stress-test but makes each omission carry too much representational weight; 60 weakens the promised step change; 90 remains a marina. Forty-eight is large enough to guarantee meaningful coverage across six risk bands and several market-cap tiers, while removing roughly three quarters of the 185 simultaneous claims. Permit a hard maximum of **60 only when selections, keyboard focus or authored formations temporarily add attention targets**; this is a ceiling, not the default.

Ship this jointly with the proposed continuous **0.42–1.15** scale re-base. It shrinks the fleet about 45%, restores a 2.7× cap-size ladder and makes the lighthouse monumental rather than merely another large object (`agents/pharosville-reborn/reviews/fleet-visuals.md:97-108`). Count and scale solve different problems: 48 restores *ma* at composition scale; 0.42–1.15 restores hierarchy among the survivors.

Omission must never mean deletion. All 185 records remain in DOM-backed search, ledger rows and keyboard navigation. Search/focus opens details immediately; selection promotes that ship into a safe berth and evicts a non-selected representative, preferably from the same coverage stratum. The ledger should state **“48 shown / 185 tracked”** (or the live promoted count) and expose coverage by risk band and cap tier. Never describe omitted ships as safe, inactive or distant traffic. This preserves record truth while rejecting the false claim that truth requires 185 concurrent meshes; the current code explicitly resolves a presence value for every placed hull (`src/systems/garden-fleet-thinning.ts:45-60`).

## 3. Mechanism sketch: replace zoom thinning with a stable presentation budget

Keep `gardenFleetDisplayPresence(input): Map<string, number>` as the pure renderer boundary (`src/systems/garden-fleet-thinning.ts:54-56`), but change its policy:

1. Add explicit base and hard limits (`48`, `60`). Give each input ship a market-cap tier (retain the semantic tier labels even if visual scale becomes continuous) and form strata by `(riskBand, marketCapTier)`. The placement layer already carries `riskBand` (`src/systems/garden-fleet-thinning.ts:31-41`).
2. Allocate 48 slots across non-empty strata: one guaranteed slot per stratum, then proportional largest-remainder allocation by stratum population. Resolve all ties lexically. Within each stratum rank by a deterministic, versioned hash of stable ship ID plus stratum key, with separately specified guaranteed anchors for the largest cap and material market mover. Do **not** rank from input order. Membership therefore survives refreshes unless a record enters/leaves or genuinely changes tier; reversing input produces the same set.
3. Force selected, focused and keyboard-targeted IDs into the visible set. Promote-on-select at once, choose a water-safe berth from that ship’s risk-band anchorage, and evict the lowest-priority unprotected representative from the same stratum (then an over-quota stratum) so ordinary promotion stays at 48. Authored formations may expand toward 60, but protected targets never push beyond 60. DOM detail disclosure is immediate; only mesh opacity/translation may ease.
4. Return `1` for the selected set and `0` for omitted ships at rest; retain short reversible fades for camera transition and replacement, not a rule that restores all hulls above zoom 0.5. Current constants encode exactly that obsolete premise (`src/systems/garden-fleet-thinning.ts:4-9`). Whole-map zoom may use the same or a smaller deterministic subset, never a larger one.

Test cutover: replace **“keeps every placed hull visible at and above the thinning start zoom”**—the universal-presence assertion at `src/systems/garden-fleet-thinning.test.ts:42-45`—with exact budget, required stratum coverage, and order-independent selected-ID assertions. The start-of-fade expectation at `src/systems/garden-fleet-thinning.test.ts:92-106` must no longer assume every candidate reaches presence 1 at the start zoom. Replace the blanket all-ones hero/attention assertion (`src/systems/garden-fleet-thinning.test.ts:73-89`) with “attention target is present, displaced representative is absent, count is bounded”; otherwise exemptions can silently defeat the cap.

## 4. Ranked alternatives

| Rank | Alternative | Cost | Primary risk |
| ---: | --- | --- | --- |
| **1** | **48 base / 60 attention ceiling + 0.42–1.15 scale re-base** | **M**: selection quotas, promotion/eviction, ledger truth copy; zero new texture/draw budget | Selection bias and visible replacement pop; mitigate with guaranteed strata, stable hashing and a short mesh fade. |
| **2** | **60 fixed + scale re-base** | M, slightly simpler promotion headroom | Safer coverage perception, but materially less negative space; 60 may become the new unchallenged floor. |
| **3** | **40 fixed + scale re-base** | M | Strongest garden composition, but sparse strata and frequent promotion swaps amplify omission anxiety and bias. |
| **4** | **90 fixed, or retain zoom-only thinning while applying scale alone** | S–M | Lowest product-change risk but highest design risk: the rest frame remains dominated by fleet inventory, so it does not answer the step-change brief. |

Recommendation: implement rank 1 as one contract. Do not ship the scale change as permission to keep more hulls, or the count cap without the scale hierarchy.
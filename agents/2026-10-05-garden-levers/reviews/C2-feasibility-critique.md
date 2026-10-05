# C2 — Feasibility critique

## Verdict
The destination is compelling, but “dependency-layered” is false: prerequisites are scheduled later or concurrently, and the calibration packet is treated as completed before its candidates exist. The resource arithmetic is mostly conservative for triangles, but incomplete for textures, bytes and submitted-pass costs. Do not execute the current wave table unchanged.

## Must-fix

1. **§5.2 / §6 — Repair prerequisite order, including acceptance dependencies.** Evidence: `specs/S9-enablers-process.md:66-88`, `S7-landscape-architecture.md:64`, `S3-data-grammar.md:80` contradict the register at plan lines 240–291. Every early/concurrent prerequisite violation is:
   - S9-P3 W0 requires S9-P2 W1.
   - S9-P5 W0 requires S9-P4 (same wave) **and candidate packets** (later).
   - S9-P2 W1 requires S2-P1 (same wave).
   - S9-P6 W1 requires S9-P2 (same wave).
   - S9-P7 W1 requires S3/S8 cutovers, including later CSS/social work.
   - S7-P3 W2 requires S2-P4 (same wave) and S2-P7 W4; only geometry **authoring**, not integration, is exempt.
   - S3-P3 W3 requires S4-P5 (same wave); making this “soft” changes the spec, and §5.2 reverses the dependency arrow. Its capture acceptance additionally requires S8-P1 W5.
   - S2-P4 requires S2-P3 if KTX2 is elected; the conditional edge is missing.

   **Replace §5.2’s opening with:** “Waves are authoring windows, not completion claims. Enforce S2-P1 → S9-P2 → S9-P3/P6. Split S9-P5 into baseline calibration after P4 and candidate acceptance after each affected candidate, with final release calibration. Split S7-P3 into pure kit authoring and adoption after S2-P4/P7; S1-P4 waits for adoption. S3-P3 waits for S4-P5; implement its UI before S8-P1, but defer capture acceptance until the S8 driver lands. Split S9-P7 into ownership-checked snapshot removal, S3-P1 teaching deletion, S8-P2 CSS cleanup and S8-P7 social replacement. KTX2 requires elected/completed S2-P3. Regenerate §6 from these edges.”

2. **§6 — Preserve omitted dependencies rather than calling the register authoritative enough.** The following additional direct prerequisites are absent, although most are satisfied transitively (specs’ `Depends` lines: S1:79; S2:67,75,83; S3:80,88,96; S4:50,59,78; S5:20,59,68; S6:33,48,63; S7:51,77; S8:29,53,63,79).

   **Add these dependency cells:** S1-P4: S2-P1, S9-P4/P5 resource sign-off; S2-P5: S2-P1, destination; S2-P6: S2-P1, charter; S2-P7: S2-P1, S9-P4/P5 release sign-off; S3-P3: S3-P1, S9-P2/S8-P1 capture acceptance; S3-P4: S3-P1; S3-P5: S2-P1; S4-P3: S2-P1; S4-P4: charter; S4-P6: S1-P1; S5-P3: S4-P1; S5-P4: S2-P1; S6-P1: destination/charter; S6-P2: S3-P1; S6-P3: S2-P1, destination; S7-P2: S4-P1 final acceptance; S7-P3: destination; S7-P4: S4-P1; S8-P1: charter; S8-P5: S4-P1; S8-P7: destination, S1-P3, S4-P1; S8-P4: S8-P2. Add a register-wide note: “Every S5 packet requires destination/charter and M5 device acceptance.”

3. **§5.1 — One lane per spec does not serialize cross-spec files, and several waves contain multiple packets per lane.** Concrete conflicts follow from specs’ file/amendment lists: W0 S9-P3/P4/P5 share `preview.mjs`; W1 S1-P1/S9-P2 share threshold, S9-P2/S2-P3/S9-P6 share renderer; W2 S1-P2/P3 share threshold/tests and S2-P4/S4-P2 share renderer; W3 S4-P4/P5 share sky tests; W4 S1-P4/S2-P6 share threshold/tests, S2-P7/S4-P6 share renderer, S5-P3/P5 share water/tests. Contracts, invariants, asset docs and changelog are recurring cross-lane seams, not independent edits.

   **Replace ownership rules with:** “One integration owner writes all shared renderer/world/preview/docs/changelog seams from lane-supplied patches, rebasing each before application. Serialize threshold S1-P1 → S9-P2 → S1-P2 → S1-P3 → S2-P6 → S1-P4 → S8-P5; serialize water S5-P1 → P2 → P3 → P5 → P4. Run S4-P3 → P4 → P5, S2-P6 → P7, S6-P2 → P4 and S8-P3 → P5 → P7 as subwaves under the stated one-agent-per-lane rule. S8/S4 own flag semantics/tests; S9 applies preview patches before their capture acceptance.” Merely merging conflicting worktrees afterward is not prevention.

4. **§7 — Correct the ledger and distinguish construction from submitted costs.** Baseline is verified: calls 179 (`outputs/holistic/day.json:30`), geometries 179 (:51), GPU p95 3.174304 ms (:56), triangles 374,708/textures 50 (:1699-1700). S1’s +60.5k reserve **already includes** shadow redraw; S7’s 24+16+4=44k **already includes** shadow/main allowance (`S1:77`, `S7:23,34,60,73`). Neither is double-counted; do not multiply again.

   **Replace roll-up rows with:**
   - “Calls: main-colour delta +9–11, projected 188–190 (including S3-P5’s trace draw); submitted shadow/reflection increments require census.”
   - “Triangles: 374,708 +60,500 +44,000 +8,000 +400 +128 = **487,736**, before unpriced activation/pass costs; measured offsets ≥7,736 needed for 480k.” S3-P5’s 128 is omitted today (`S3:94`); enabling hidden signs also adds submitted triangles, despite unchanged geometry (`garden-sea-signs.ts:105,234`).
   - “Textures: S2 +3−2, S3 +≤1, optional S7 +1: **51–53 final**, up to **55 transitional** before retirement.” S3’s lazy ink atlas is absent from the plan (`S3:78`; `garden-sea-signs.ts:211-214`).
   - “Historical-baseline JS estimates: **1,000.5–1,009.5 KiB procedural; 1,020.5–1,049.5 loader; 1,030.5–1,069.5 loader+KTX2**.” S2 procedural sums to 8–17, not 8–14 (`S2:30,39,58,73,81`); include S9-P2’s +1 (`S9:66`). The 1,024 ceiling requires up to 25.5/45.5 KiB measured offsets for loader/KTX2. Public decoder transfer is separate; obtain fresh production bytes before allocation.

5. **§4 / §9 — Resolve overlapping contracts before task dispatch.** S9 direction B has two stone groups, S1 macro B a triad (`S9:26`, `S1:19`): related, not interchangeable approvals. S1 reserves an inset for S3-P4 although P5 renders it (`S1:57`, `S3:90-96`); S1 removes texturelessness in P1 while S2-P6 deletes that pin again (`S1:49`, `S2:72`).

   **Insert:** “D1 approves a direction; CP-B approves layout within it, or explicitly reopens D1. S1-P2 exports the gravel inset descriptor; S3-P4 owns dated data, P5 owns trace integration. S1-P1 retires recipe/texturelessness pins; S2-P6 adds atlas ownership/lifecycle coverage. Home restores seat; Escape closes selection to the saved station pose, not automatically home.” The final sentence resolves S9’s Escape charter against S8-P3 (`S9:43`, `S8:41`).

## Should-fix
- **Sizing:** §3’s >one-week L means thirteen L rows already exceed 65 agent-days, before 34 M rows, serial integration, GPU matrices and recruitment. Replace §5.3 “each S” with “independent subchanges, not whole-packet sizing”; S3-P7 remains M and diagnosis-open. W2 is not a releasable “new foreground” until remaining acceptance dependencies land.
- **Five citation spot-checks:** threshold swells (:156-170), off-frame engawa (:468-483), deciduous pine reuse (`garden-flora.ts:249-261`) and 70% reveal comment (`pharosville-world.tsx:484-487`) support the plan. Replace “unconditional downward smear” with “shore-distance LOD and symmetric vertical three-tap blur” (`garden-water.ts:1096-1113`); its visibility/weight is conditional.

## Preserve
Keep procedural-first/conditional loader, no speculative LOD savings, operator-only taste gates, M5 acceptance, unchanged 500k hard cap and source-grounded spike diagnosis. No tests, builds or browser runs were performed for this read-only review.

# PharosVille — adversarial plan review

## 1. Verdict

**Not reliably as written.** D1–D7 address the picture’s structural defects, but the biggest risk is execution topology: an eighteen-day feature programme masquerades as one session, with acceptance blocked on later work and parallel owners touching the same files. The likely failure is an unfinished camera/water/massing cutover surrounded by optional ornament, not insufficient artistic ambition. Ship the acceptance image before expanding its vocabulary. (Plan §§1–5; `reviews/astra-ruthless-critic.md:69–76`.)

## 2. Contradictions and errors

- **D3 geometry is substantially correct.** For a centred, unrolled perspective camera, horizon distance from the top is `h/H = (1 − tan(pitch)/tan(vFOV/2))/2`. At 32°/12° this is **12.94%**, not exactly 12%; at 22°/24° it is **−64.53%**, outside the image. Hills can occlude the nominal band; neither formula guarantees the crown silhouette. Downward orthographic rays at 24° cannot show a geometric sea horizon: the fallback changes §1’s acceptance, not merely implementation. (Plan §2 D3; `reviews/camera-composition.md:24`.)
- **The dependency graph cannot pass its own gate.** W1 requires the reflection implemented in W2.6. W4.16’s top-three/four harbour allocation feeds W1.2 after that shot has been approved. W3.2 consumes W2.1 weights; W2.10 edits W3’s fleet batch, and W2.11 edits W3’s rim. W5 depends on W2 tokens in §5 but only W1 in the graph. W1/W2 also overlap in calendar time despite the serial gate. (Plan §§3,5.)
- **§4’s arithmetic is correct, its coverage is not.** Rows sum to −2 calls/+48k triangles/+15 textures/+2.6 ms. But W1.10–12 permit **15–44k** triangles against 40k; W3.8–10 plus W1.13 total **48k**, not 45k. W4.16 alone permits 25k against W4’s entire 15k reservation; its explicitly timed W4.5/11/13 total **0.7–2.0 ms**, already above 0.5. Foreground, overview, near-detail, shadow-memory/time, cloud-shadow and material-plane costs lack explicit allocations or offset reconciliation. Savings from W3.7/W2.12 do not excuse an absent ledger. (Plan §§3–4.)
- **Savings are speculative, not funding.** Curation does not guarantee proportional draw savings from batches. Measure −45 calls before spending it. The source budget calls its figures maximum reservations, distinguishes DOM time, and requires disjoint handling; W0.1 omits that handling. Explain the new 16-ms GPU target versus the source’s 20-ms frame ceiling, and retain both measurements. (Plan W0.1, §4, W6.4; `reviews/astra-ruthless-critic.md:9`; `reviews/render-perf-budget.md:34–59`.)
- **Quiet and semantic restraint contradict feature scope.** D9 promises three readings, but W4.13–16 add PSI-weather, supply-gauge, coverage-moon and supply-frontage metaphors. W4.18’s 3–6-minute windows plus 20–35-second transitions imply roughly 9–18 relocations/hour, not ≤4 unless additional holds are specified. Three beats in every 30-minute watch are not guaranteed by 4–6/hour. W4.7’s bell contradicts deferred sound. (Plan §§1–3.)
- **Mechanical inconsistencies:** W0–W6 are seven waves, W0 has seven items, not six. D2 calls the ladder logarithmic; W1.5 specifies a clamped power law. (Plan §§2–5.)

## 3. Missing

- **Truth/access contracts silently weakened:** explicitly preserve the finite, authoritative 140×140 risk/navigation field and make the added sea decorative/non-selectable; require screen-space picking tolerance after shrinking; preserve GLB/proxy scale coherence; require immediate DOM details, safe promotion, and consorts inside the cap. These were proposed but neither fully specified nor rejected. Same-stratum eviction also needs a rule when every candidate is protected. (Plan W0.2, W1.4–7; `reviews/astra-ruthless-critic.md:19,37,47–51`.)
- **Unrecorded lane conflicts:** W1.1 replaces the camera lane’s world-bounds-fitted orthographic shadow camera with frustum fitting; define caster coverage and stable shadows at breathing extremes. W1.3 adopts perpetual breathing over the critic’s bounded idle parallax without recording that conflict. (Plan §§2,6; `reviews/camera-composition.md:24,30`; `reviews/astra-ruthless-critic.md:29`.)
- **Re-pin omissions:** W1.4 omits thinning monotonicity; W1.6 omits clustering and crowded-band spread; W1.5 cites only the tail of the nearest-neighbour test. W2.2’s removed lift breaks the exact night-grade pins; W2.1/13 need dusk-grade disposition. W5.5 must state whether reserved token values and vermillion hierarchy survive. W2.5 claims floor/ratio tests that the map explicitly did not find. Preserve observable contracts, delete incidental values rather than re-pin them. (Plan §3; `reviews/test-coupling-map.md:12,17–24,28–32`.)
- **Acceptance coverage:** add omitted-ship keyboard promotion, projected picking/anchors during breathing, reflection alignment, and phase-specific postcard subject visibility. The map identifies the existing postcard check as only a byte-count proxy; deleting it alone proves nothing. The promised shaded threshold also needs a safe rectangle beyond merely clipping one bough. (Plan §§1,3 W0.4/W1/W6; `reviews/camera-composition.md:26–30`; `reviews/test-coupling-map.md:48`.)

## 4. Over-scoped

Defer W0.5’s wholesale renderer split; W3.6 rigging, W3.7 asset retirement, W3.12 shared material abstraction; W4.5 processions, W4.7 theatrical depegs, W4.10 waterfall rebuild, W4.13–17 extra metaphors/microseasons; W5.3 onboarding replacement and W5.4’s full ledger redesign. Keep minimal readable details/coverage, one truthful arrival and the evening ritual. These cuts preserve §1 while avoiding another interpretation-heavy world legend. Treat 4096² shadows and cloud shadows as measured optional upgrades, not baseline commitments. (Plan §§1–3; `reviews/astra-ruthless-critic.md:57–59,71–87`.)

## 5. Order

Start timer/bible and curation/scale together; freeze projection and composition; integrate camera + sea/sky + hero reflection + island/shore as one demonstrable slice. Bring harbour footprint constraints forward. Gate that picture before five-beat lighting, essential craft, minimal DOM, then director/clock and one ritual. Serialize shared shader ownership. Acceptance precedes optional features, not follows them. (Plan §§3,5; `reviews/astra-ruthless-critic.md:69–76`.)

## 6. Five concrete edits

1. **§2 D3 →** replace “~12%…ortho fallback” with “12.94% unobscured band; orthographic fallback requires explicit acceptance-image revision.”
2. **§3 W1/W2.6 →** replace the forward-dependent reflection gate with “W2.6 joins W1’s integrated camera/sea/island slice; approve reflection alignment before lighting.”
3. **§4 →** replace aggregate spending rows with “one net row per retained item, measured baseline/savings, shadow bytes, disjoint-safe GPU and CPU/frame totals; reconcile to W6 ceilings.”
4. **§3 W4/§6 →** replace W4.5,7,10,13–17 commitments with explicit deferrals; retain director, temporal spine, one arrival, dusk ritual and DOM provenance.
5. **§5 →** replace day-overlapping waves with §5 of this review’s dependency gates, named shared-file integration ownership, and a composition stop/go before discretionary work. (Grounding: plan §§2–6 and findings above.)

**Evidence boundary:** documentary review only; no source edits, tests, builds or captures. Evaluated the perspective formula and budget sums directly; the calculations above are not GPU measurements. Remaining risk: actual framing, batching savings and reflection-layer cost still require the plan’s real-GPU acceptance, not another paper estimate. (Plan W0.1/W1/W6; `reviews/render-perf-budget.md:41,45,59`.)

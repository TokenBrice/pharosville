# L19 — Arrival, first impression, loading, fallback and errors

## Verdict

Arrival is already choreographed, but it choreographs atmosphere before comprehension: an unbranded gradient becomes a nine-second hazy camera rise, while one broken secondary feed can replace both the garden’s voice and its orientation. The biggest lever is a **task-ready, recognizably branded threshold with independent teaching and source status**, not a longer cinematic introduction.

## Evidence

1. **First-byte shell has colour, not an experience.** `index.html:18-57` computes the visitor’s solar-hour gradient before modules load, and preloads local Garamond (`:14-16`); good continuity and no remote assets. But body is an empty root plus module (`:76-78`), with no heading, analytics links or noscript content. Desktop Suspense supplies only “Charting market winds…” (`src/client.tsx:113-116`; `src/pharosville-desktop-data.tsx:21`). [INFERENCE] Slow/failed module delivery leaves a visually anonymous gradient; bootstrap/module failure cannot be rescued by a React boundary that has not loaded. No loading-duration capture was supplied.

2. **Arrival is not missing; its priorities are wrong.** Existing arrival raises the eye 3 units over **9 s**, thinning aerial haze from **1.8× over 6 s** (`src/systems/garden-arrival.ts:4-18`). It waits for data, shader warmup and resolved motion preference; reduced motion takes 200 ms, explicit selection/camera skips it, and input interrupts it (`src/pharosville-world.tsx:1115-1165`). These are valuable safeguards. The previous pass explicitly left early-arrival outer-ocean exposure unchanged (`agents/2026-10-02-visual-upgrade/02-execution-record.md:95-96`). [INFERENCE] Adding haze to the already hazy daytime view makes the first impression less legible, not more advanced.

3. **H5 confirmed: raw exception text occupies the emotional headline.** `outputs/holistic/day-chrome.png` (bottom-left) and `day-1200x640.png` show “Mint and burn unavailable · Fetch failed: Schema validation failed for /api/mint-burn-flows…” cut off. Source classification stores the raw query message (`src/hooks/use-pharosville-world-data.ts:155-160`); caption exposes `status.reason` verbatim and prioritizes the first non-current source (`src/systems/detail-model.ts:117-135`). Masking/nowrap hides its tail (`src/pharosville.css:736-748`). The ledger already preserves exact reasons (`src/components/accessibility-ledger.tsx:198-210`), so technical fidelity does not require the raw exception in the rest frame. Conversely the total-failure notice says only “Signal buoy obscured by fog” (`src/components/query-error-notice.tsx:7-14`): poetic, but ambiguous about which readings exist.

4. **H4 is reinforced by onboarding starvation.** First-visit teaching starts only after arrival completes (`src/pharosville-world.tsx:1168-1173`), then plays three seven-second lines; any pointer/key/wheel/touch permanently marks it seen (`src/hooks/use-visitor-line.ts:8-13,74-94`). A non-current source outranks every teaching (`src/systems/detail-model.ts:117-135`). [INFERENCE] During persistent mint-burn failure the hook can silently finish and mark orientation seen without displaying its lessons. Even healthy arrival does not immediately explain tower/water/sails. The `/` instruction is last. This delays the product’s “at a glance” promise (`PRODUCT.md:22-24`).

5. **Gate is technically principled, emotionally an exclusion page.** Both screen and viewport return before desktop import (`src/client.tsx:94-109`), correctly respecting sorted-size profiles. Copy says “needs a wider harbor” and foregrounds pixel requirements (`src/desktop-only-fallback.tsx:8-15`), followed by five external analytics destinations (`src/fallback-links.ts:1-7`), not embedded live tables despite “tables below.” `RotateToLandscape` actually recommends width **or height**, not rotation (`src/rotate-to-landscape.tsx:9-13`): good semantics despite legacy naming. The still is cover-cropped behind a heavy horizontal scrim and boxed content (`src/pharosville.css:245-278`). [INFERENCE] Portrait crops sacrifice the threshold/garden context; an actual phone capture is needed before judging the rendered gate.

6. **Preview and fallback promise different products.** `public/og-card.png` says “signals as an island-city” beside a generic illustrated lighthouse, while HTML says “A Living Stablecoin Garden” (`index.html:60-74`). Shipped `garden-day.jpg` has substantially more near pines than current live chrome; stills are release captures, not current readings (`src/client.tsx:10-14`). `garden-night.jpg`’s lower third is almost black: H3 confirmed for this still’s foreground, not a measured contrast claim. H1/H2 are visually consistent with both stills’ lollipop bough/green bank; this lens does not diagnose their geometry. Renderer failure correctly keeps a selectable **DOM** overview (`src/components/world-static-overview.tsx:21-45`), not a second graphics runtime.

## Levers — ranked

### 1. Task-ready branded threshold · Impact 5 · Effort M

**Change:** In `index.html`, `client.tsx`, desktop loading and arrival owners, establish one persistent DOM identity/reading-key surface: “PharosVille / live stablecoin garden”, clearly identified loading stage, and working analytics links before React. Replace anonymous waiting with authored local-hour imagery **only if explicitly approved as a desktop pre-runtime still**; otherwise retain the gradient with strong typography. Reveal the complete rest composition as soon as ready; make atmospheric settling subordinate and interruptible, not nine seconds of deferred orientation. Never fake percentages.

**Risk:** A still can falsely imply live readings, introduce transfer/decode cost, or mismatch the new art. **Contracts:** PRODUCT §§Purpose/Design Principles; VISUAL_INVARIANTS §§Picture, Atmosphere, Motion; CONTRACTS §Runtime/security/access. Keep wall-clock lighting and static reduced-motion parity; explicitly flag pre-runtime imagery as a boundary change, never put it behind renderer failure. **Dependencies:** camera, lighting, new rest art. **Verify:** cold/warm 0–10 s real-GPU capture; first meaningful DOM/first full-world timestamps; JS-disabled/module-failure surface; targeted arrival/gate tests.

### 2. Bounded human source status, exact evidence deeper · Impact 5 · Effort M

**Change:** Keep source classification truthful and fix the mint-burn schema mismatch with the API owner; separately change `detail-model.ts`, `NowCaption`, query notice and ledger entry affordance. At rest: “Issuance readings unavailable · Source details”; for retained samples: “Issuance readings held · as of 14:32”. Expand to source, coverage, exact timestamps, raw failure and retry. Total failure: “Live readings could not be loaded” plus actual recovery/analytics actions. Poetry can accompany this, never replace it.

**Risk:** Sanitized copy accidentally conflates held/unavailable/loading or hides additional failed feeds. **Contracts:** CONTRACTS §Runtime/source states (`:27-52`), VISUAL_INVARIANTS §Coarse truth/DOM. **Dependencies:** API/schema repair, ledger navigation. **Verify:** live 1200×640 and 900×720 captures; targeted caption/query/ledger tests for single/multiple failures, unknown age and preserved raw reasons.

### 3. Teach independently of the ambient sentence · Impact 4 · Effort S

**Change:** Replace timer-only first-visit teaching in `use-visitor-line.ts` with a compact, dismissible DOM reading key available immediately with the world: “Sails: stablecoins · Water: peg risk · Lighthouse: market stability”; direct “Find a stablecoin” action. Source warning remains simultaneously visible. Mark seen only on explicit dismissal/completed teaching, not incidental interaction or invisible timer expiry; retain a discoverable key afterwards.

**Risk:** Extra chrome consumes negative space; fit at both gate profiles without a modal. **Contracts:** PRODUCT §§Purpose, Calm reveals complexity; VISUAL_INVARIANTS §§Hierarchy, Coarse truth; no eligible ships hidden. **Dependencies:** chrome design/search. **Verify:** first-visit healthy/degraded captures, reduced-motion/keyboard path, targeted orientation persistence tests.

### 4. An intentional small-screen edition and truthful social card · Impact 4 · Effort M

**Change:** Recompose existing gate as a welcoming static garden edition: actual brand/title, short explanation, explicit “Illustration, not live readings”, useful analytics navigation, secondary desktop size guidance. Use authored portrait/landscape still crops and regenerate five beats after the art cutover. Replace `og-card.png` with the accepted garden composition plus concise title/encoding promise, not the obsolete island-city illustration. Preserve renderer-failure DOM overview and exact details; do not add a graphical fallback there.

**Risk:** Duplicate assets drift; crop maintenance and night readability. **Contracts:** PRODUCT §Accessibility; CONTRACTS §size gate/no secondary renderer; VISUAL_INVARIANTS §wall clock. **Dependencies:** new garden composition, release asset pipeline. **Verify:** 390×844/844×390 and narrow capable-window captures, image decode failure, zero world/API/GLB/logo requests when blocked; OG 1200×630 and thumbnail review.

## Do-not-do / traps

Do not add a compulsory “Enter garden” splash, pretend progress, sequential ship spawning, auto-tour, or more fog/bloom to disguise weak scenery. Do not suppress schema validation or call absent readings calm. Do not replay all onboarding after every visit. A2/B1/P1 were rejected as indistinguishable, W1 unwarranted (`02-execution-record.md:17-20`): type/colour micro-tuning is not the step change. Do not confuse the debug HUD in supplied captures with production branding.

## Invariants worth challenging

Challenge **warning monopolizes the only caption** (`detail-model.ts:102-105`), an implementation rule rather than necessary truth contract. Simultaneous bounded qualification plus independent teaching improves honesty. Replace the nine-second entry prescription, not the authored rest-seat invariant. No need to weaken the small-screen gate, DOM parity, wall clock, attention budget or renderer contract.

## Captures wanted

Run serialized on the reference GPU; these commands use existing flags:

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --first-visit --fixture quiet-dense --seconds 12 --out levers/l19-first.png --json levers/l19-first.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1200 --height 640 --hash '#t=12.25' --seconds 12 --out levers/l19-live.png --json levers/l19-live.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --first-visit --fixture quiet-dense --reduced --width 900 --height 720 --out levers/l19-reduced.png --json levers/l19-reduced.json
```

**Missing instrument:** preview waits for a visible ready canvas and fleet before capture (`scripts/pharosville/preview.mjs:451-508`). It cannot currently capture blocked mobile, module failure, or true first-byte arrival; `--seconds 0` is not a cold-start film. Request a serialized navigation-relative 0/0.5/1/2/4/6/9/12 s filmstrip plus blocked-size/no-WebGL capture support before those acceptance arms; do not claim settled screenshots verify arrival. No gates, browsers or tests were run for this read-only review.

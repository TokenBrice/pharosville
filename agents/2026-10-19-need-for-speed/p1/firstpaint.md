# First paint, welcome path and progressive reveal

## 1. Scope and method

Research only; no tracked application/config/documentation files changed, no builds, no server restarts, no test/lint gates. Read `AGENTS.md`, the research brief, architecture/runtime/testing/contracts docs, the requested shell/entry files, Vite preload generation, and engine/data/fleet readiness sources. A read-only scout mapped the latter dependencies; important predicates were also read directly.

Artifacts: `outputs/need-for-speed/firstpaint/`. Eight `npm run preview` calls, serialized by the existing shared lock, all successful on the real NVIDIA GPU: one complementary live desktop, three `:4173` desktops, three live blocked windows, one `:4173` blocked window. Reused the load owner's three live cold desktop runs rather than spending three more captures. All timing is **contended**, cold browser cache, unthrottled, DPR 1. Desktop 1600×1000; blocked 700×500. No claim that the results characterize a quiet machine or a slow-network visitor.

Command shape (literal observer/eval sources saved in scratch):

```sh
npm run preview -- --url https://pharosville.pharos.watch/ \
  --width 1600 --height 1000 --cold --waterfall --log-requests \
  --wait 10000 --seconds 3 --ready-timeout 25 --timeout 120 \
  --init-script '<observer.js contents>' --eval '<eval.js contents>' \
  --json outputs/need-for-speed/firstpaint/live-1.json \
  --out outputs/need-for-speed/firstpaint/live-1.png
```

Local desktop substitutes `http://127.0.0.1:4173/`; blocked runs use `--width 700 --height 500 --wait 0`. The blocked ready poll necessarily expires after 25 s because the world correctly never starts. This is harness waiting, **not** welcome-page loading time.

Observers record Paint Timing, LCP candidates including element markup, layout shifts excluding recent input, first layout-ready arrival/gate rAF, `data-pv-live` mutation, and poster removal. `first visible rAF` in raw JSON means a laid-out DOM node was found before that rAF; it is **not a compositor presentation timestamp**. FCP is the better observable first-paint milestone. `shot.mjs`'s `firstFrameNavMs` polls the engine stat; contrary to its comment, it does **not** mean the poster crossfade has completed (`scripts/harbour/shot.mjs:186-190`). We measure the transition separately.

Inspected PNGs: `live-1.png`, `local-1.png`, `blocked-live-2.png`, and `poster-reference.png` (a resized conversion of the actual AVIF). Static size checks: `wc -c public/arrival-shell.css public/fonts/*.woff2`; gzip-size computations on the existing built entry/React/CSS. No code spike was necessary.

## 2. Measurements

### Desktop first-paint and hand-off

All values milliseconds from navigation, except CLS. Load-owner samples are `outputs/need-for-speed/load/a-cold-{1,2,3}.json`; their FCP is at `evalResult.paint`, LCP/marks at `evalResult.measure`.

| Metric | Live cold, load owner n=3: median [individuals] | Local `:4173`, own n=3: median [individuals] |
|---|---|---|
| FCP | **144** [472, 144, 112] | **300** [100, 300, 372] |
| First shell LCP candidate | **144** [572, 144, 112] | **424** [128, 424, 488] |
| Latest recorded LCP candidate | **4200** [572, 4512, 4200]; see warning below | **424** [128, 424, 488] |
| Engine first frame (`shot` poll) | **2974** [12650, 2974, 2654] | **3840** [1642, 3840, 4221] |
| Crossfade starts (`data-pv-live`) | **3044.6** [13323.2, 3044.6, 2760.3] | **4183.3** [1767.9, 4183.3, 4751.7] |
| Poster removed / fade completed | **4171.1** [14730.0, 4171.1, 3862.2] | **5356.5** [2888.7, 5356.5, 6050.8] |
| CLS | Not collected by owner; complementary own live n=1 **0.00012941** | **0.00012941** [same in all three] |

The first shell LCP element is the `<dd>` beginning “One boat is one stablecoin.” It is **not the full-viewport poster**. Later, the live intro (`.hb-intro`, with its paper SVG background) becomes the LCP candidate in runs 2/3. That intro is deliberately scheduled 1400 ms after a fleet-bearing model (`src/harbour/ui/CornerMark.tsx:32-45`). Thus the latest LCP is not a consistent world-ready clock, and samples that stop before the intro are effectively right-censored. Do not improve the score by hiding teaching content. Keep separate first-paint, rendered-fleet, crossfade-start and fully-revealed-world measurements.

Own complementary live n=1: FCP 168; initial `<dd>` LCP 168; later intro LCP 5500; engine frame observed at 3909.2; `shot` poll 3943; crossfade 4051.0; poster removal 5175.7. Arrival layout-ready rAF 92.6. **[INFERENCE]** The initial arrival card is painted with the first contentful shell paint at approximately 168 ms; the 92.6 ms rAF is only a DOM/layout lower bound, not proof of earlier on-screen pixels. Local arrival layout-ready rAFs were 22.1/106.8/117.8 ms; their actual first contentful shell paints were 100/300/372 ms. No per-pixel arrival filmstrip was captured.

Local final screenshots really show the foggy, fleet-free **awaiting data** state, not the live fleet. The absent API makes this a failure-path sample, not a production data-latency benchmark.

### Blocked welcome path: bytes, requests, paint

| Metric | Live blocked n=3 | Local blocked n=1 |
|---|---|---|
| Raw page-target wire bytes, median [range] | **235,364 B** [234,329–235,865] | **215,929 B** |
| Site-associated wire bytes, excluding injected browser extension | **222,204 B** [221,169–222,705] | **202,769 B** |
| Request attempts excluding extension | **12** each, including beacon and attempted RUM | **10** |
| World/API/GLB/logo requests | **0 / 0 / 0 / 0** in every run | **0 / 0 / 0 / 0** |
| Harbour/rendering JS, layout, sea-SDF, identity atlas requests | **0** in every run | **0** |
| FCP median [individuals] | **116 ms** [248, 116, 84] | **40 ms** |
| LCP median [individuals] | **116 ms** [412, 116, 116] | **72 ms** |
| Gate layout-ready rAF median [individuals] | **93.8 ms** [262.4, 80.2, 93.8] | **53.6 ms** |
| CLS median [individuals] | **0** [0.00118349, 0, 0] | **0.00118349** |

The raw CDP total includes a browser extension `chrome-extension://cimiefiiaegbelhefglklhhakcgmhkai/page-script.js`, **13,160 B** every capture. It is not a site optimization opportunity. Site-only totals subtract it. Counts include the zero-response-byte Cloudflare RUM attempt; they are request attempts, not all successful response bodies. CDP tracks this page target, so challenge iframe traffic is not a complete measured total.

Blocked LCP is the actual in-page illustration `<img class="pharosville-gate__still">`, URL `/harbour/poster-960.avif`; the full-window loading poster is removed after the React gate. The poster is requested once at 700×500, not twice.

**Yes, the blocked welcome downloads and evaluates React and the entry:** median live CDP wire is **69,701 B React + 5,407 B entry = 75,108 B**. They remain even though every world request is correctly gated. Existing build gzip sizes are 68,261 B React and 4,054 B entry; local observed transfer includes slightly different gzip/header overhead. Three fonts total **74,556 B raw WOFF2**, all requested. The 960 poster is 47,368 B body; representative live wire 48,670 B. Therefore the React/entry pair is about **33.8% of the site-associated blocked wire total**.

### Representative early resource waterfall: own live desktop

| Resource | Request start → end (ms) | Priority | CDP wire bytes |
|---|---:|---|---:|
| EB Garamond 400 normal | 44 → 76 | High | 25,049 |
| EB Garamond 600 normal | 44 → 75 | High | 25,761 |
| Poster 1600 AVIF | 45 → 82 | High | 105,474 |
| `arrival-shell.css` | 45 → 75 | VeryHigh | 2,623 |
| Entry JS | 45 → 63 | High | 5,356 |
| React vendor | 45 → 64 | High | 68,805 |
| Harbour chunk | 45 → 84 | High | 319,634 |
| Rendering vendor | 45 → 83 | High | 245,090 |
| EB Garamond 400 italic | 95 → 119 | VeryHigh | 26,727 |
| Harbour CSS | 101 → 127 | VeryHigh | 8,087 |

Poster response completion is **not** decode/presentation time. No independent poster-visible timestamp was instrumented. The poster is not this desktop's LCP, so LCP cannot stand in for it. The media slice separately measured bitmap decode; see `p1/media.md`.

`arrival-shell.css` is the one first-shell render-blocking stylesheet; raw 6,785 B / gzip 2,291 B. Fonts use `font-display: swap`, so they are not an intentional font-blocking gate. Normal weights start with the poster/chunks; italic is discovered after CSS, one dependency later. No throttled font-priority A/B was performed, so this table proves contention potential, not that removing a particular preload improves FCP.

The live Cloudflare beacon is `defer`, Low priority, **10,351 B gzip wire**; representative blocked request 36→60 ms. No Google Tag Manager request was present. The existing built entry contains no `gtag`/`googletagmanager`/`requestIdleCallback` strings: the optional `VITE_GA_ID` path is absent in this build. GA source is already idle-deferred (`src/google-analytics.ts:31-36`), but an idle callback can run during network waits; it is not a guaranteed post-world callback. No current measured GA gain should be booked. Raw live HTML also contains an injected Cloudflare challenge script; its iframe cost remains unmeasured.

## 3. What the visitor sees, and what actually blocks reveal

### Current timeline

1. **First byte:** identity, guide, honest “Raising the harbour.” and working analytics links already exist in HTML; no React is needed to produce them (`index.html:37-60`). CSS supplies the poster gradient while the image loads. Both fonts and poster are preloaded.
2. **First contentful shell paint:** 144 ms median live cold owner sample / 300 ms local. The card is not a JavaScript loading placeholder. React later uses **`createRoot().render()`**, not hydration (`src/main.tsx:10-14`), replacing the static root with substantially matching shell DOM. Poster lives outside that root, so it survives.
3. **Entry/module loading:** shipped media-gated modulepreloads start the Harbour/rendering requests at the same 45 ms as entry/React; there is no extra React-sized *network discovery* waterfall to fix. The lazy import is evaluated when the admitted client renders (`src/client.tsx:10-15,59-77`). The unconditional Vite React modulepreload and static React entry dependency still affect blocked visitors (`dist/index.html:35-40`). Removing just that preload does not remove the React import.
4. **First live WebGL frame:** all nondeferred systems/required geometry plus compilation complete. The poster still covers this frame. In live owner's three samples stablecoins parsed at 1830/726/677 ms, **well before** their first world frames at 12650/2974/2654 ms. There is no 8 s data-wait saving in these successful samples.
5. **Reveal:** the watcher checks drawn + a defined stablecoins snapshot, or an 8 s elapsed grace; then counts four watcher callbacks. Source actually initializes the count and immediately decrements it in the same callback. At 60 Hz this is about three further frame intervals (~50 ms), not four guaranteed completed fleet renders. Observed delays can be much larger under contention: own live first-frame rAF→reveal **141.8 ms**, local **179.2/376.6/600.8 ms**. These include scheduling/deferred work; do not attribute all of them to `SETTLE_FRAMES`.
6. **Transition:** arrival card opacity transition 700 ms; poster 1100 ms; shell unmount timer 1200 ms. Poster has a 1300 ms removal fallback (`public/arrival-shell.css:27-41`; `poster.ts:6-20`; `harbour-app.tsx:61`). Engine frame ≠ full visibility. Default-motion crossfade contributes approximately **1.1 s** after reveal begins; reduced-motion CSS uses 1 ms.
7. **Later enrichment:** Life and Identity already initialize after first render. Chart lettering/crests do not need a new “defer them” optimization. Fleet emblem *image* loading and Wreck Cove kit already start from the frame/update path after initial boot. The emblem slot-map metadata and main hull kit still block Fleet init. WOFF2 fonts do not appear in `Engine.init()` awaits. DOM detail/search logos do not need to block the first world.

`Engine.init()` sequentially awaits nondeferred systems and compiles (`engine.ts:123-144`); `initLater()` is launched inside the first frame callback, before that callback returns (`engine.ts:150-165,209-212`). Deferred synchronous work can therefore delay subsequent reveal callbacks even though it is not an explicit app readiness prerequisite. Coordinate with BOOT/frame-loop owners rather than duplicate their scheduler work.

### 8 s wait: important truth and timing distinction

`DATA_WAIT_MS` starts **after `engine.init()` finishes**, not at navigation (`harbour-app.tsx:43-55`). It is neither a total 8 s startup cap nor a shader/asset timeout. Also `feed.payloads.stablecoins !== undefined` means **an attempt has settled**, not success: failed refresh stores `{data:null,error:...}` and notifies listeners (`data/fetch.ts:155-167`). That explains the immediate local failure-path reveal. The local captures did **not** exercise the unresolved-request 8 s timeout.

Data already has an honest empty/unavailable initial model (`sim/system.ts:100-107`). Data updates install a model and calculate poses before Fleet updates; Fleet checks pose count against model boat count (`sim/system.ts:158-164`; `fleet-system.ts:637-665`). A rendered model-version/pose-ready signal is possible; fixed rAF counts are a proxy for it.

**Recommended policy:** keep fleet-first reveal on the normal fast path, but make readiness explicit: a successful stablecoins model has been installed, its pose count matches, Fleet has populated instances, and one frame with that model was rendered. Do not wait for every feed, fonts, detail logos, emblems image or Identity atlases. If first attempt fails, reveal an explicitly unavailable/awaiting-data harbour after the base scene frame; do not announce “The harbour is live.” If a request is still pending, an operator-approved **1.5–2 s grace from the first render** could replace 8 s, followed by an unmistakably awaiting-data scene.

The last shorter-grace step is **not yet visual-neutral**: later arrival currently installs an entire fleet without an arrival opacity transition. Do not simply unhide that fleet, do not sprinkle boats over time (it would momentarily misstate market coverage), and do not add decorative fog to conceal it (fog already means stale data). Require coherent, short reveal of the complete fleet and dependent wakes/rigging/markers from actual poses, with final geometry/materials/data unchanged, reduced-motion behavior, and filmstrip approval. If that cannot pass marginal-impact review, retain the current pending-data hold; the deterministic successful-data path still wins independently.

### Poster match

The inspected golden-hour poster and current live daylight screenshot have recognizably matching landmark framing, but **do not make an invisible swap**: sky/light color, water, and fleet poses differ conspicuously. The local no-data frame is much foggier and lacks the pictured fleet, correctly. A fixed poster cannot exactly match arbitrary time, weather, live supply/boats or URL view. Do not freeze the live world to the illustration or remove truth-state fog. Shortening the fade is a reviewable motion change, not a proven free win. Side-by-side static images were inspected; no transition filmstrip or night variant was captured.

## 4. Findings / opportunities

Expected gains below are **not additive**; blocked-path, successful-data and slow-pending cases affect different visitors.

| ID | Opportunity | Evidence | Proposed change | Expected gain, estimation method | Visual impact + verification | Effort | Risk | Dependencies / conflicts | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| FIRSTPAINT-01 | Gate before importing React, with first-byte welcome markup | `main.tsx:1-14`, `client.tsx:59-72`, blocked live median 75,108 B entry+React | Render the real welcome/illustration/links statically; a tiny external runtime-neutral bootstrap performs the same sorted **screen AND viewport** tests, imports React/client only on admission, and listens for resize admission. Move error/analytics installation deliberately rather than losing it. | **[estimate] ~74 KB cold blocked wire saved** after ≤1 KB compressed bootstrap, ~33% of blocked site total; at 9 Mbps ~66 ms serialization, at 20 Mbps ~30 ms, plus unmeasured React evaluation/DOM replacement avoided. No desktop network-discovery gain booked. | **none** if the same welcome DOM/styles/links are preserved. Compare 700×500, phone, tall desktop, foldable, resize up/down; require zero world/API requests blocked. | M | M: bootstrap/CSP/listener teardown and static duplication | Coordinate BUNDLE-01; remove unconditional React dependency, not only its preload. Preserve module/fetch gate and screen test. | H bytes / M timing |
| FIRSTPAINT-02 | Replace settle-frame heuristic with rendered model/pose readiness | `harbour-app.tsx:49-61`, `sim/system.ts:158-164`, `fleet-system.ts:637-665`; observed frame→reveal 142–601 ms own samples | Publish completed rendered model-version/pose/instance readiness and reveal on the first qualifying completed frame; no blind extra callbacks. Preserve failed/pending states. | **[estimate] ~50 ms at60Hz / ~100 ms at30Hz** fixed successful-ready wait removed; potentially more scheduler delay, but not all observed 142–601 ms is recoverable. No asset/render savings claimed. | **none** if exactly the already-complete fleet frame is exposed. Filmstrip delayed stablecoins, already-landed data, zero-boat payload and failure; assert no boats at origin or partial coverage. | M | M: correct milestone must be after render, not just payload parse | BOOT/data/fleet owners; keep model identity/pose-count contract, don't merely change count to0 | H mechanism / M gain |
| FIRSTPAINT-03 | Shorter poster transition once a complete world exists | CSS poster1100/card700; measured poster removals1121–1299ms after attr locally | Trial poster fade **600 ms** with matching JS fallback/timers; preserve motion-reduced1ms path. Do not change scene illumination/time to match poster. | **[estimate] 500 ms earlier full-opacity world**, arithmetic1100−600; zero reduction in engine/data readiness or first-paint bytes. | **visual-risk pending approval**: mismatched golden/day/night lighting makes abruptness plausible. Compare captured transition filmstrips day/night/fog, heart/overview, supported sizes and reduced motion. | S | M aesthetic; low implementation | Operator motion review; coordinate FIRSTPAINT-02 to avoid double-counting time-to-reveal | H bound / L acceptance |
| FIRSTPAINT-04 | Bound pending-data poster hold without jarring fleet pop-in | `harbour-app.tsx:12,43-61`; failed snapshot semantics `fetch.ts:155-167`; empty initial model and instantaneous fleet install | For *still-pending* data only, trial1.5–2s grace after first rendered base scene instead of8s; show persistent awaiting-data status, then coherently reveal all correctly posed fleet components on actual success. Fast successful path stays fleet-first. | **[estimate] up to6–6.5s less frozen-poster time** for long-pending requests (8000−1500/2000); **0 ms** in measured successful/failure samples; final data arrival time unchanged. | **visual-risk**, not approved no/marginal yet. Delayed-data filmstrips and truth-state review mandatory; no fake fleet, staggered coverage, decorative fog or raw whole-fleet pop. | L | H: coherent arrival touches multiple render components | Operator policy choice; fleet/readings/UI work. If quality fails, retain current grace. | H conditional bound / L visual acceptance |
| FIRSTPAINT-05 | Remove the first-shell CSS request dependency, without loosening CSP | `index.html:18`; CSS6,785B/gz2,291B, representative live docTTFB35/CSSend75ms | Trial inlining the **identical small shell stylesheet** into first-byte HTML with an automatically generated CSP style hash, retaining no-inline-script policy. Keep all necessary gate/failure styles; do not add `unsafe-inline`. | **[estimate] ≤one CSS request/RTT**, ~20–40ms under supplied cable/fast4g RTT models; 0–40ms in the own unthrottled run before other work dominates. Net bytes roughly neutral (~2.3KB moves into HTML); not a measured FCP win. | **none** with identical CSS. Verify CSS hash/security headers across builds, JS-disabled arrival, blocked welcome, renderer failure, first paint at throttled network. | M | M: stale CSP hash can remove all shell styling | CSP/build ownership; contrast with S8 Early Hints delivery options before choosing. Not a reason to weaken security. | M |
| FIRSTPAINT-06 | Honest stages and explicit hand-off instrumentation | current failed-snapshot path briefly says“live”; `CornerMark.tsx:29-64`, CSS86-93; `shot.mjs:186-190` misnames first-frame readiness | Keep“Raising the harbour”for boot; use“Waiting for the fleet's readings”only while actually pending;“Harbour ready; live readings unavailable”on failure;“live”only on real data. Add marks for first rendered fleet, crossfade start/end and poster presentation/decode. Keep loading text width stable. | **0 ms direct load reduction**, but prevents booking a false1.1s gain or a fictitious8s saving; makes FIRSTPAINT-02/04 measurable. No fake progress percentage. | **none** to scenery; small intentional UI text change. Check failure/pending/status announcements and no new layout shifts. | S/M | L | Shared with BOOT/load tooling. Keep unavailable state visible rather than hover-only if scenery is revealed before data. | H |

### Can the welcome page be pure HTML/CSS with zero JS?

**Its content and layout can.** It only needs the illustration, guide, sizes explanation and ordinary links; no data or React is intrinsically necessary. **The adaptive root experience cannot be literally zero-JS while preserving automatic screen+viewport admission and later window-resize activation.** CSS alone cannot import the world, maintain the independent physical-screen test, or run analytics/error reporting. A separate static welcome URL could be zero JS, but forcing blocked visitors there or requiring navigation/reload on resize would change current behavior. Prefer FIRSTPAINT-01's tiny bootstrap and zero React/world bytes, not a misleading “zero JS” claim. Do not gate the HTML response by User-Agent or send private screen-derived cache variants. The current Pages HTML function only rewrites social tags for known `sel=` values; ordinary `/` returns the asset unchanged, without upstream fetch or buffering (`functions/index.ts:214-227`). There is no hidden API wait in HTML delivery to remove.

## 5. Ruled out / not worth booking

- **“Add preload for Harbour/Three/layout/GLBs”**: already shipped and media-gated. Desktop requests start together with entry JS. Removing preload `media` or starting API in HTML would violate the gate.
- **“Remove just React's unconditional modulepreload”**: static imports still fetch/evaluate React on every welcome. Requires the actual pre-React boundary.
- **“Defer fonts, crests, logos or Identity so the world can appear”** as a blanket recommendation: fonts are swap and not engine prerequisites; Identity/Life and emblem image/Wreck Cove already deferred. The metadata/hull critical path is different and belongs with asset/boot slices.
- **Remove normal font preloads / add italic preload blindly**: no measured throttled improvement; all three weights/styles are used and current CLS is negligible. Normal preload removal may simply trade ~25KB of early competition for late font swaps. Additional italic preload adds another high-priority25KB contender. Current Latin WOFF2 assets are already compact enough to require evidence before a visual/typography change.
- **Remove the arrival guide or delayed intro to lower LCP**: score gaming and lost instruction, not faster world readiness. Full-viewport poster is not the observed desktop LCP.
- **Replace `createRoot` with hydration alone**: no React-byte saving; the current static root and React tree are not identical (`h1`→`h2`, App wrappers/boundary), so this needs structural work and has no established material gain. FIRSTPAINT-01 avoids blocked React entirely.
- **Defer GA again**: optional source is already idle-deferred and absent from this built entry; no measured GA request. Error-reporter installation only attaches listeners; no unconditional request/storage walk. Keep startup failure visibility.
- **Remove/delay Cloudflare beacon as a first-frame fix**: only10.4KB, Low priority; no causal startup penalty demonstrated. Disabling analytics is an operator/product choice, not a default no-impact optimization. Challenge iframe traffic is not quantified.
- **Treat the 8s constant as an observed8s waste or total navigation deadline**: no measured sample incurred it, failures satisfy the predicate early, and initialization happens before its timer.
- **Reveal sky/water while island/civic/hull geometry is missing**: replacing a coherent illustration with visibly incomplete scenery is not a no/marginal-impact optimization. Separate base-scene readiness from data readiness, not arbitrary object-by-object pop-in.
- **Make the fixed golden-hour poster match by forcing time/weather or using fixture fleet**: changes world truth/scenery; forbidden.

## 6. Open questions / operator decisions

1. Is a clearly labelled empty awaiting-data harbour after1.5–2s preferable to the poster for genuinely pending requests? If yes, approve only after a complete-fleet arrival treatment is shown to be marginal. Otherwise keep8s and ship the safe readiness/bootstrap changes independently.
2. Is a600ms transition still calm enough across golden/day/night/stale data? Static comparisons prove mismatch, not the best duration. No approval assumed.
3. Does eliminating a small CSS RTT justify a CSP-style-hash build step, or should external CSS remain for simpler deployment/security? Validate an A/B before adopting FIRSTPAINT-05.
4. Need first poster decode/presentation timestamps and a transition filmstrip for true time-to-illustration and no-pop assurance. Current observer establishes resource completion, FCP, DOM readiness and transition boundaries, not exact compositor presentation.
5. Live FCP/LCP/readiness n=3 is available from the owner; live CLS has only this slice's one independent sample (local CLS n=3, blocked live n=3). No slow-network firstpaint-specific A/B, literal stalled-request timeout test, font-priority variant or motion variant was run. These are evidence limits, not missing report work.

**Recommended order:** FIRSTPAINT-01 and FIRSTPAINT-02 first; FIRSTPAINT-06 alongside them. FIRSTPAINT-03/04 are conditional visual experiments, not unconditional no-impact promises. FIRSTPAINT-05 is a lower-priority delivery A/B. No blocker to this research deliverable.

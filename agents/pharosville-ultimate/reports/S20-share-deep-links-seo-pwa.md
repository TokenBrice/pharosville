# S20

## Executive summary

A visitor cannot currently share a working “look at USDe” selection: edge metadata recognizes legacy URLs, but the Harbour UI neither restores nor writes selection state. Postcards already produce attractive framed PNGs, but their timestamps and freshness captions contain reproducible errors. Restore selection links, browser history and Copy link first; then repair postcard provenance and support touch sharing. Static entity cards offer the smallest OG improvement; dynamic rendering is feasible but needs deployment measurements. PWA and embedded experiences require deliberate product choices. Preserve the existing viewport gate throughout.

## Current state

- Homepage metadata is comprehensive: canonical, description, OG/Twitter image dimensions and honest illustration alt text exist. public/og-card.png is a verified 1200×630 PNG. Evidence: index.html:6; index.html:20; docs/pharosville/GITHUB_MEDIA.md:9.
- The root Pages Function safely validates legacy ship IDs against the registry and rewrites title/description without upstream requests. All selections retain the static image; chains receive no specialized copy. Evidence: functions/index.ts:60; functions/index.ts:103; functions/index.ts:128; functions/index.ts:160.
- Selection currently lives only in memory. Search calls store.select(); initialization sets selected:null, and selection changes do not update URLs. Repository searches found no pushState, replaceState, popstate or clipboard implementation. Evidence: src/harbour/ui/Search.tsx:66; src/harbour/ui/store.ts:111; src/harbour/ui/store.ts:322.
- Camera and decorative time parameters already work without DEV guards: view/cam use the query; t supports query or fragment. These do not restore historical market readings or simulation positions. Evidence: src/harbour/layout/layout-system.ts:48; src/harbour/engine/time-of-day.ts:146; src/harbour/engine/time-of-day.ts:231; src/harbour/sim/system.ts:94.
- P captures the actual drawing-buffer resolution after hiding chrome, then adds paper, framing, date, PSI and freshness. Save downloads PNG; no upload or native share exists. Pixel quality depends on current DPR/quality. Evidence: src/harbour/ui/store.ts:508; src/harbour/ui/postcard.ts:54; src/harbour/ui/Postcard.tsx:30.
- The manifest advertises display:browser and one SVG icon. No service-worker registration or offline shell was found. This is a manifest-bearing website, without a deliberately implemented installed/offline experience. Evidence: public/manifest.webmanifest:7; public/manifest.webmanifest:10; src/main.tsx:48.
- Robots permits crawling except /api/, while the sitemap lists only the homepage. No structured data was found. llms.txt still describes desktop-only access despite supported tablets and foldables. Evidence: public/robots.txt:1; public/sitemap.xml:3; public/llms.txt:6; src/main.tsx:27.
- Embedding and native Web Share are explicitly denied by policy. These are intentional constraints, not missing frontend switches. Evidence: public/_headers:5; public/_headers:7; public/_headers:10; functions/_shared.ts:13; scripts/pharosville/check-security-headers.mjs:41.
- Blocked windows retain useful static guidance and analytics links before React/world imports. This is a strong foundation for selection-aware arrivals and offline posters. Evidence: src/main.tsx:14; src/main.tsx:27; index.html:69.

## Findings

### S20-F1 [high] Legacy selection URLs unfurl correctly but do not select their subject

- Evidence: functions/index.ts:128; functions/index.ts:223; src/harbour/ui/store.ts:111; src/harbour/ui/store.ts:322; src/harbour/ui/mount.tsx:9.
- Detail: A recognized ?sel=ship.usde-ethena request can receive USDe metadata, but the UI always starts unselected. There is no client sel parser, URL writer, history listener or Copy link action. Current landmark identities also differ from the edge's lighthouse/pigeonnier vocabulary. The preview promises context that arrival does not deliver.
- Fix: Implement one shared selection codec, retain legacy aliases, resolve subjects after model readiness, and connect selection/history/Copy link to that contract. Test edge-to-client round trips.

### S20-F2 [medium] Postcards print lighting-key time as clock time

- Evidence: src/harbour/ui/Postcard.tsx:31; src/harbour/engine/time-of-day.ts:209; src/harbour/engine/time-of-day.ts:254; src/harbour/ui/postcard.ts:18.
- Detail: Postcard passes timeOfDay.hour, which is season-remapped lighting time, rather than clockHour. A read-only execution of the source functions with sunrise 07:00, sunset 17:00 and clock 17:00 produced a 19:51 postcard caption and filename.
- Fix: Pass clockHour, label decorative scene time explicitly, and include an unambiguous capture timestamp/timezone. Add a seasonal-remapping regression case.

### S20-F3 [medium] Postcard freshness can misrepresent stale or qualified readings

- Evidence: src/harbour/ui/postcard.ts:21; src/harbour/ui/postcard.ts:26; src/harbour/ui/bits.tsx:7; src/harbour/ui/Panel.tsx:250; src/harbour/model/types.ts:153.
- Detail: The freshness line uses stablecoin age even when stale PSI triggered the warning. Source execution with PSI two hours old and supply five minutes old printed “last updated 5 min ago.” Stale stress alone still produced an unqualified “Readings as of” caption. psi.qualified is omitted entirely, although the panel explains its missing early-warning inputs.
- Fix: Name the freshness scope and timestamp of each represented signal; summarize lagging dependencies and preserve PSI qualification. Unknown age must remain unknown. Extend caption tests with mixed endpoint states.

### S20-F4 [medium] Postcard declares a modal without containing interaction

- Evidence: src/harbour/ui/Postcard.tsx:40; src/harbour/ui/Postcard.tsx:52; src/harbour/ui/App.tsx:51; src/harbour/ui/App.tsx:71.
- Detail: The dialog focuses Save but has no focus trap, native modal behavior or inert background. Tab can reach underlying controls, and global harbour shortcuts remain active while the postcard is open. Arrows can pan the world and P can initiate another capture behind the declared modal.
- Fix: Use a native modal dialog or explicit focus containment, suspend underlying shortcuts, and restore focus to a connected launcher or wordmark. Verify Tab, Shift+Tab, Escape and repeated P.

### S20-F5 [low] Postcard failures are silent and blob cleanup is incomplete

- Evidence: src/harbour/ui/Postcard.tsx:24; src/harbour/ui/Postcard.tsx:33; src/harbour/ui/Postcard.tsx:37; src/harbour/ui/Postcard.tsx:42.
- Detail: take() is fire-and-forget without a catch; failed capture/composition rejects without visitor feedback, and a null PNG blob silently does nothing. Object URLs are revoked only by Close, so replacing a card or unmounting through the viewport gate lacks cleanup. Pending capture also has no cancellation guard.
- Fix: Show a concise retryable error, handle null blobs, ignore cancelled results, and revoke each object URL on replacement/unmount. Cover failure and teardown paths with component tests.

### S20-F6 [low] Touch visitors have no postcard launcher

- Evidence: src/harbour/ui/App.tsx:81; src/harbour/ui/KeyList.tsx:15; src/harbour/ui/CornerMark.tsx:62; src/harbour/ui/store.ts:501.
- Detail: The only production caller of requestPostcard() is the P keyboard handler. The ledger lists the shortcut as text, and the corner controls omit a postcard button. Supported tablets without an attached keyboard cannot invoke this sharing feature.
- Fix: Add a quiet Postcard button inside the existing on-demand ledger or selection panel, using the same store action.

### S20-F7 [medium] Production camera parameters bypass the bounded-view contract

- Evidence: src/harbour/layout/layout-system.ts:48; src/harbour/layout/layout-system.ts:53; src/harbour/engine/camera-rig.ts:81; src/harbour/engine/camera-rig.ts:210.
- Detail: The cam parameter accepts arbitrary finite targets, distances and pitch without a DEV guard or bounds clamp. applyPreset installs those values directly. For example, cam=0,0,0,-1,0 gives a negative distance and consequently a negative far plane. A shared camera URL can therefore create an invalid or unusable view.
- Fix: Validate public camera state against allowed target, positive distance and fixed pitch/yaw limits. Reject malformed tuple lengths. Keep unrestricted capture controls development-only if still needed.

## Ideas

### S20-I1 Restore durable subject links

*professional · ux · effort M · impact 5 · confidence 5*

- What: Introduce a runtime-neutral selection codec used by the edge and UI. Preserve ship.<id> links, normalize legacy landmarks, and support boat/harbour/yard/wreck/current landmark identities. Resolve once authoritative model/layout readiness exists; show an honest unavailable-subject state when resolution fails.
- Visitor benefit: A shared USDe link actually opens USDe, including after reload.
- Data/DOM: Identity only; never force a coin onto the Shoals. Current model state determines position. Test legacy aliases, unknown IDs, delayed readiness and removed subjects.
- Where: functions/index.ts:128; src/harbour/ui/services.ts:11; src/harbour/ui/store.ts:111; src/harbour/ui/mount.tsx:9.
- Perf: Estimated <3 KB gzip shared/client logic; no additional draws or API requests.
- Risks: Live-only entities may be absent from the checked-in registry. Avoid importing the full metadata registry into the tiny admission entry.
- Depends on: —

### S20-I2 Copy link and browser history

*professional · ux · effort M · impact 5 · confidence 5*

- What: Add Copy link to the selected panel. Write normalized query URLs, push deliberate subject changes, and handle popstate without generating another history entry. Keep transient hover/follow frames out of history. Provide a selectable URL fallback when clipboard writing fails.
- Visitor benefit: Share a subject in one action; Back and Forward retrace inspected coins and chains.
- Data/DOM: Copy confirmation uses an aria-live status. Preserve selection through gate unmount/readmission; test close, reload, Back and Forward.
- Where: src/harbour/ui/store.ts:322; src/harbour/ui/Panel.tsx:41; src/harbour/ui/Search.tsx:66.
- Perf: Estimated <2 KB gzip; event-driven URL work only; zero rendering cost.
- Risks: Guard restoration against feedback loops and pending model loads. Do not copy arbitrary diagnostic parameters.
- Depends on: S20-I1

### S20-I3 Share framing with explicit time semantics

*enchanting · ux · effort M · impact 4 · confidence 4*

- What: Offer subject-only links by default and an optional Include this view action. Serialize bounded camera framing and explicitly labeled decorative clock/season state. Record observation time as context, while saying the destination shows latest readings. Use the postcard for the captured historical appearance.
- Visitor benefit: “Look at USDe on the Shoals” carries context without pretending a live URL freezes market history.
- Data/DOM: Do not serialize dews/offpeg/stale overrides. DOM copy: “Observed at …; opens latest readings.” Historical replay would require a separate immutable-data design.
- Where: src/harbour/layout/layout-system.ts:48; src/harbour/engine/time-of-day.ts:215; src/harbour/sim/system.ts:224; src/harbour/ui/facts.ts:95.
- Perf: Estimated 1–3 KB gzip; no new draws, triangles or polling.
- Risks: Different aspect ratios cannot guarantee identical composition. Validate camera bounds; distinguish lighting time, capture time and data publication time.
- Depends on: S20-I1, S20-I2

### S20-I4 Selection-aware welcome on blocked viewports

*professional · ux · effort M · impact 5 · confidence 5*

- What: Reuse the edge's validated identity lookup to add subject-specific static welcome text and a matching Pharos analytics link. Put that content inside the welcome template so main.tsx preserves it. Unknown subjects keep generic guidance; chains use a checked static mapping.
- Visitor benefit: A phone recipient knows which coin was shared and can inspect its analytics immediately.
- Data/DOM: Identity and explanatory text only: no live readings, logo fetches, world imports or API calls. Test blocked physical screens, narrow windows and later readmission.
- Where: functions/index.ts:103; index.html:69; src/main.tsx:14; shared/lib/chains.ts:8.
- Perf: Estimated <1 KB additional HTML per selected response; zero extra client requests.
- Risks: Static registries cannot substantiate “on the Shoals right now.” Escape all text and generate only approved destination URLs.
- Depends on: S20-I1

### S20-I5 Make postcard provenance reliable

*professional · data-bound · effort M · impact 5 · confidence 5*

- What: Correct clockHour usage, snapshot caption inputs alongside capture, and print capture UTC separately from scene lighting time. Replace the blanket freshness sentence with scoped signal freshness and PSI qualification. Keep the existing paper treatment and actual-resolution capture.
- Visitor benefit: The exported image remains understandable and trustworthy after it leaves the app.
- Data/DOM: Use readings.psi.score/band/stale/qualified and model.truth endpoint states/ages; non-current or null-age evidence gets explicit text. Reuse panel qualification wording. Unit-test mixed freshness, missing PSI, qualified PSI and seasonal time.
- Where: src/harbour/ui/postcard.ts:16; src/harbour/ui/Postcard.tsx:30; src/harbour/ui/Panel.tsx:250; src/harbour/ui/postcard.test.ts:13.
- Perf: Estimated <1 KB gzip; one additional caption line; unchanged world rendering.
- Risks: Long provenance text must wrap legibly at low drawing-buffer resolutions. Data publication time must not be inferred from an unknown age.
- Depends on: —

### S20-I6 Finish the postcard dialog lifecycle

*professional · ux · effort M · impact 4 · confidence 5*

- What: Use real modal containment, suppress background shortcuts, expose capture progress/errors, reject duplicate requests while a card is open, and cancel pending results on teardown. Revoke blob URLs whenever cards change or unmount.
- Visitor benefit: Keyboard users can save and close predictably; capture failures are recoverable.
- Data/DOM: Accessible dialog name, contained Tab order, Escape, live error/progress status and reliable focus return. Add focused component tests.
- Where: src/harbour/ui/Postcard.tsx:23; src/harbour/ui/Postcard.tsx:40; src/harbour/ui/App.tsx:51.
- Perf: Estimated <2 KB gzip; releases retained PNG memory; zero steady-state GPU cost.
- Risks: Viewport-gate teardown may occur during capture or font loading. Avoid updating an unmounted component.
- Depends on: —

### S20-I7 Touch-accessible postcard and native sharing

*enchanting · ux · effort M · impact 4 · confidence 5*

- What: Add an on-demand Postcard button and retain the generated Blob for an explicit Share button. Feature-detect file sharing, retain Save PNG and Copy link fallbacks, and permit web-share=(self) in document policy and its checker. Invoke sharing from the ready-card button's user gesture.
- Visitor benefit: Tablet visitors can capture and send the image without discovering a keyboard shortcut.
- Data/DOM: Reuse corrected postcard caption as share text; announce failures and treat user cancellation quietly. [Policy reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/web-share).
- Where: src/harbour/ui/KeyList.tsx:15; src/harbour/ui/Postcard.tsx:56; public/_headers:7; functions/_shared.ts:15; scripts/pharosville/check-security-headers.mjs:41.
- Perf: Estimated <2 KB gzip; one existing PNG Blob retained while the dialog is open.
- Risks: File sharing varies by platform. The current header explicitly blocks it, so UI-only implementation would fail.
- Depends on: S20-I2, S20-I5, S20-I6

### S20-I8 Prefer build-time entity OG cards

*professional · infra · effort M · impact 4 · confidence 4*

- What: DECISION-NEEDED: generate informational 1200×630 coin/chain cards using installed sharp, checked metadata and the existing illustration. Keep names in a separate caption area, retain the illustration disclaimer, and map validated selections to versioned image URLs. Keep the generic card as fallback.
- Visitor benefit: Shared cards identify their subject visually without request-time rendering.
- Data/DOM: Static identity only; no live numbers or Shoals claims. Metadata alt text names the subject and identifies the background as illustration.
- Where: functions/index.ts:160; index.html:25; package.json:104; docs/pharosville/GITHUB_MEDIA.md:41.
- Perf: Estimated 100–300 KB/image and tens of MB across the catalogue; zero new browser JS or edge rasterization CPU.
- Risks: Requires an explicit exception to the current prohibition on token/chain names in promotional art. Regenerate when identity metadata changes; avoid duplicating oversized backgrounds unnecessarily.
- Depends on: S20-I1

### S20-I9 Conditional dynamic OG rendering

*professional · infra · effort L · impact 3 · confidence 3*

- What: DECISION-NEEDED alternative to S20-I8: add a dedicated image Function using workers-og or explicit Satori→resvg WASM with local fonts/assets. Cloudflare also documents an image-response plugin. Validate IDs, render fixed templates, cache version+entity keys, and fall back to static art. Avoid request-time market fetching initially. [Pages support](https://developers.cloudflare.com/pages/functions/plugins/vercel-og/).
- Visitor benefit: Flexible entity cards without generating every image during deployment.
- Data/DOM: Identity-only baseline. Live numbers would need dated source fields, unavailable states, matching DOM text and tests. Never accept remote image/font URLs from query parameters.
- Where: functions/index.ts:175; functions/_shared.ts:48; package.json:78; wrangler.toml:1.
- Perf: Unmeasured allowance: 2–6 MiB edge JS/WASM/fonts; tens–hundreds ms CPU per rasterization. Current documented limits: 64 MiB uncompressed bundle, 128 MB memory, 1 s startup; Free CPU 10 ms/request, Paid default 30 s. [Limits](https://developers.cloudflare.com/workers/platform/limits/).
- Risks: Account plan is unknown; Free CPU is not a safe assumption. Measure deployed bundle/startup/miss CPU. workers-og defaults include remote fonts and immutable caching; override deliberately. Cache API is datacenter-local. [Implementation](https://github.com/kvnang/workers-og/blob/main/packages/workers-og/src/og.ts), [cache scope](https://developers.cloudflare.com/workers/runtime-apis/cache/).
- Depends on: S20-I1

### S20-I10 Unify subject metadata and crawl policy

*professional · infra · effort M · impact 3 · confidence 5*

- What: Extend the shared identity contract to current landmarks and known chains; synchronize edge and client titles. Keep camera/time variants canonicalized away. Add WebApplication microdata to existing static content without relaxing script CSP. Correct llms.txt's device description. Expand sitemap entries only if substantive indexable subject pages are approved.
- Visitor benefit: Tabs, search results and unfurls consistently describe the destination.
- Data/DOM: Use checked identity/explanatory copy only. No fabricated ratings, market timestamps or structured-data promises of rich results.
- Where: functions/index.ts:68; functions/index.ts:164; index.html:11; public/sitemap.xml:3; public/llms.txt:6; shared/lib/chains.ts:8.
- Perf: Estimated <2 KB HTML and <1 KB client logic; no world fetches.
- Risks: Homepage canonical is currently coherent. Self-canonical subject pages should follow a content/indexing decision, not create hundreds of thin duplicate pages.
- Depends on: S20-I1, S20-I4

### S20-I11 Deliberate installable observatory

*professional · infra · effort S · impact 3 · confidence 4*

- What: DECISION-NEEDED: change display to standalone, add stable manifest id plus 192/512 raster and maskable icons, and offer installation only through a quiet on-demand action on supported devices. Keep installed-window admission identical to browser admission.
- Visitor benefit: Returning observers can open the harbour as a dedicated application window.
- Data/DOM: No live data changes. Installation must not imply phone support or offline market availability. A service worker is a separate offline feature. [Installability guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
- Where: public/manifest.webmanifest:5; public/manifest.webmanifest:10; index.html:13; src/main.tsx:27.
- Perf: Estimated 30–150 KB static icons; <1 KB optional install-action code; zero added draws.
- Risks: Installation behavior differs by browser. Small installed windows must still receive the welcome page.
- Depends on: —

### S20-I12 Offline poster with honest navigation fallback

*professional · infra · effort M · impact 3 · confidence 4*

- What: Add a small service worker that caches only a versioned offline HTML page, arrival CSS and one poster. Use network-first navigation with that fallback. Leave /api/, world bundles, GLBs and logos outside its caching policy; do not boot the world from the offline document.
- Visitor benefit: A returning visitor sees the harbour illustration and a clear offline explanation instead of a browser error.
- Data/DOM: DOM says “Offline — illustration, not live readings.” Preserve subject identity when safely available; never replay cached analytics as current.
- Where: src/main.tsx:6; index.html:69; public/manifest.webmanifest:5; scripts/harbour/build-asset-registry.mjs:102.
- Perf: Estimated <3 KB worker plus one bounded poster/CSS cache; zero offline WebGL or API activity.
- Risks: Service-worker updates can pin old documents. Version caches and test upgrades against the existing hashed-asset retention model. First-ever offline visits remain unsupported.
- Depends on: —

### S20-I13 Poster-first embeds with optional gated live mode

*enchanting · ux · effort L · impact 3 · confidence 4*

- What: DECISION-NEEDED: start with a linked poster on pharos.watch coin pages. If live embedding is wanted, add a dedicated /embed document with exact frame-ancestors allowance for approved hosts, no conflicting X-Frame-Options DENY, and click-to-start. Keep the ordinary app's denial policy and both viewport size checks.
- Visitor benefit: Analytics readers discover their coin in the harbour without an automatic heavy page load.
- Data/DOM: Poster is labeled illustration. Live mode uses existing readings and DOM panels; small iframe slots never import the world or fetch its data.
- Where: public/_headers:5; public/_headers:10; scripts/pharosville/check-security-headers.mjs:48; src/main.tsx:27; src/harbour/app/harbour-app.tsx:38.
- Perf: Poster-only: one cached image, zero WebGL. Activated live iframe: approximately another full existing runtime/data workload; no measured incremental CPU/GPU figure.
- Risks: Parent CSP must permit framing. A query flag cannot loosen response headers. Avoid globally weakening policy, multiple simultaneous worlds, and parent-controlled gate bypasses.
- Depends on: S20-I1, S20-I4

### S20-I14 Complete reciprocal analytics links

*professional · ux · effort S · impact 4 · confidence 4*

- What: Publish the stable selection-link contract for a separately authorized pharos.watch change: “See this coin in PharosVille.” Add matching outbound analytics links to active boat and chain panels here, using validated route mappings rather than inferred slug rules.
- Visitor benefit: Move between the harbour's explanation and the coin's detailed evidence without searching again.
- Data/DOM: Identity-only navigation. Retain accessible new-tab wording where applicable; no new endpoint or browser cross-origin API call.
- Where: src/harbour/ui/Panel.tsx:116; src/harbour/ui/Panel.tsx:183; src/harbour/ui/Panel.tsx:477; functions/index.ts:99.
- Perf: Estimated <1 KB client code; ordinary anchor navigation; no added rendering work.
- Risks: The host repository was not inspected and is outside this task's authorization. Confirm its canonical coin/chain routes and identifier mapping before implementation.
- Depends on: S20-I1, S20-I4

## Top picks

1. S20-I1 — Repairs the fundamental broken destination contract using infrastructure already present.
2. S20-I2 — Turns restored links into a discoverable sharing workflow and makes browser navigation useful.
3. S20-I5 — Fixes reproduced analytical provenance errors in exported images with no rendering expense.
4. S20-I4 — Preserves shared context for phone recipients while respecting the zero-world-data gate.
5. S20-I14 — Small navigation changes connect discovery, explanation and authoritative analytics.

## Operator decisions

- Should sharing default to latest readings with an observation timestamp, or is immutable historical replay a separately funded requirement?
- May informational OG cards contain coin/chain names outside the illustration, explicitly narrowing docs/pharosville/GITHUB_MEDIA.md:49?
- Choose build-time static entity cards or fund measured dynamic rendering; which Workers plan and recurring CPU budget are available?
- Should PharosVille offer a standalone installed experience and a poster-only offline fallback?
- Are linked posters sufficient for pharos.watch, or should a dedicated live embed permit specific parent origins?
- Should subject URLs remain sharing conveniences canonicalized to the homepage, or become substantive independently indexed pages?

## Cross-lane hooks

- UI/accessibility: share the selection/history contract across Search, panel rows, ledger, keyboard stepping and gate readmission; coordinate postcard modal fixes.
- Data truth: keep Shoals membership authoritative; preserve endpoint-specific freshness and PSI qualification in every exported caption.
- Infrastructure: isolate OG rendering from app-shell latency, measure actual WASM bundle/startup/CPU, and update route-specific header checks for approved sharing/embed policies.
- Host integration: provide stable coin/chain identifier mappings and separately authorized reciprocal links; the pharos.watch repository remains untouched.
- Skipped: browsers, visual inspection, full test suites, deployment/account inspection and host-repository inspection. Only caption/season functions received read-only execution checks.
- Risk: OG resource costs are estimates; exported pixels, production headers, native sharing and PWA installation require later runtime validation.

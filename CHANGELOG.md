# Changelog

PharosVille release notes are collected from commit history and mirrored into the in-app changelog panel. A version is published only when the protected workflow also creates its semantic tag and GitHub Release; see `docs/pharosville/RELEASES.md`.

## v0.7.2 - 2026-08-13 - Quiet Anchorage

The harbor becomes a composed picture rather than a full one: the fleet gathers
into anchorages with open water between them, distance finally reads as
distance, and the light moves through the day.

Collected from the 2026-08-13 visual poetry pass after v0.7.1.

- Moored the fleet in anchorages instead of spreading it evenly across every stretch of water, so each sea keeps one harbor that matters, a few quieter roadsteads, and genuine open water between them; the lighthouse holds the frame again.
- Restored aerial perspective at the standard framing, where a mis-set reference height had silently disabled it: the far sea now drains toward haze and dissolves at the world's edge instead of ending on a hard boundary.
- Put the sun on a real arc, so shadow direction and length, the sky's glow, and the sun's road across the water all change with the hour rather than only shifting colour; the Pharos tower now casts a long shadow over the sea that stretches toward dawn and dusk.
- Let the sails read as cloth. Each issuer's mark now sits in the canvas instead of on a hard-edged plate, and brand colour eases back when you pull out over the whole sea and returns in full as you sail in, so identity stays exact where you are actually reading it.
- Deepened the drifting mist into layered banks and settled the daylight frame, keeping every reading, hover, selection, and ledger entry unchanged.

## v0.7.1 - 2026-08-12 - Roomier Harbor

PharosVille now charts on 14-inch laptop displays and zoomed desktop windows
without weakening the mobile no-fetch boundary.

Patch release for the 2026-08-12 laptop viewport regression after v0.7.0.

- Added a 1200×640 wide-laptop size profile alongside the existing 900×720 desktop profile, admitting MacBook-class windows whose usable height is reduced by browser chrome or zoom.
- Kept compact-height framing safe by using the fitted camera instead of the tighter desktop crop, preserving the lighthouse crown, controls, footer, and selected detail panel inside the visible window.
- Extended viewport guards, browser coverage, fallback guidance, and generated runtime facts so the wider support contract remains synchronized while undersized screens still load no world data or Three.js runtime.

## v0.7.0 - 2026-07-30 - Living Sea

The harbor becomes a more responsive analytical place: weather, water, sails,
light, and guided inspection now share one deterministic world state, while
the fleet keeps its actual issuer heraldry at every zoom.

Collected from the 2026-07-30 breathtaking rendering release after v0.6.2.

- Added a weather-driven sea and sky: deterministic wind moves the Gerstner water, sails, rain, ambient life, lighthouse, and post-processing together across day, dusk, night, and reduced motion.
- Made ship movement leave persistent, correctly directed wakes and strengthened the harbor's depth with managed ambient occlusion, graded atmosphere, storm response, and calmer tier transitions.
- Reworked Observe into an interruptible guided harbor tour that begins from the displayed camera, returns safely after resize, and names the landmarks it reaches.
- Restored logo-only sail identity. Sails stay clean while a mark is loading, then show the issuer's real logo in its native colors on brand-dyed cloth; ticker letters can no longer appear on sails.
- Hardened the renderer for long sessions with explicit texture-upload ownership, resource disposal, real-GPU preview telemetry, whole-map texture census coverage, and no shipped WebGPU fallback chunk.

## v0.6.2 - 2026-07-27 - Rightful Colors

Every batched ship now flies its own stablecoin identity instead of a logo borrowed from the opposite row of the sail atlas, restoring the heraldry promised by True Colors across the full fleet.

Collected from the v0.6.2 atlas-addressing fix after v0.6.1.

- Corrected the CanvasTexture-to-WebGL row transform so each batched identity sail samples the atlas cell painted for that ship; Frankencoin no longer receives BlackRock's dark wordmark, and the same fix applies fleet-wide.
- Restored the transparent atlas cell used by ordinary sails, removing the unrelated logo plates that had leaked onto secondary canvas without adding draw calls, textures, or issuer-specific exceptions.
- Added a shader-addressing regression test and verified the corrected fleet through the complete release lane, real-GPU day and night captures, reduced motion, a 60 fps performance gate, and the eight-frame artifact probe.

## v0.6.1 - 2026-07-27 - True Colors

Stablecoin sails recover the familiar logos that disappeared into brand-dyed canvas during the Three.js migration, restoring fleet-scale recognition without bringing back the old stripe, panel, and border clutter.

Collected from the v0.6.1 sail-identity fix after v0.6.0.

- Restored each stablecoin's complete logo as the primary sail mark, preserving its original disc, colour block, and silhouette instead of preferring a disc-free extraction that became indistinct at fleet scale.
- Added one restrained logo-safe contrast plate and thin livery rim while retaining the quieter dyed cloth and weave introduced by the rendering-cleanliness pass.
- Kept deterministic emblem and ticker fallbacks for decode failures, with focused texture tests and real-GPU day, night, performance, and eight-frame artifact checks confirming the treatment remains stable.

## v0.6.0 - 2026-07-27 - Clear Bearings

The harbor keeps all 186 analytical ships while shedding the false mountains, radial glare, hard water facets, and flicker that made the sea look broken; the result is calmer at every reviewed desktop shape, faster to refresh, and easier to inspect.

Collected from the v0.6.0 implementation change after v0.5.0.

- Cleared the largest rendering artifacts. The three horizon cards that appeared as mountains in open water are gone, the lighthouse now carries one coherent beam instead of a radial fan of overlapping cones, and hero reflections, light lanes, lantern pools, seams, foam, wakes, and zone tinting have been reduced where they competed with ships.
- Made the sea read continuously through day, dusk, and night. Bathymetry now uses a softened limited-palette ramp instead of hard posterized bands, distant water no longer reads as a finite slab, danger no longer emits a full-region flash, and the beacon and water-lane shaders use calm continuous motion with anti-aliased transitions.
- Replaced world-like UI clutter with quieter inspection cues. Boundary buoys are sparse landmarks unless their region is being inspected, selection uses a compact depth-tested waterline ring rather than a translucent shaft, unrelated wakes and reflections recede in analyze view, and the full 186-ship fleet remains present.
- Removed the common refresh hitch without changing the world contract. A renderer-facing content signature retains meshes for equivalent payloads, cutting the measured refresh to a 56 ms median busy interval with 6 ms blocking, while settled reduced-motion frames now remain well below the 500,000-triangle ceiling.
- Made every allowed desktop window genuinely chartable. The lazy, orientation-free gate now requires a 900 px long side and 720 px short side, the camera preserves the lighthouse crown at edge sizes, controls meet WCAG target sizes with 44 px hoverless targets, dynamic scene scrims improve legibility, and the first-visit action arrives before the long-form ledger.
- Added regression evidence for the faults that escaped ordinary screenshot tests: first-pass, tall, standard, whole-map, and ultrawide layout coverage; source guards against horizon and obsolete beam geometry; an eight-frame real-GPU flash/bright-coverage probe; settled reduced-motion resource assertions; and a 320-ship-plus-outsider capacity fixture with selection, DOM parity, and disposal checks.

## v0.5.0 - 2026-07-26 - The Cargo Tide

The world stops showing only what exists and starts showing what is moving: crates load and land as supply is minted and burned, a tide reads the week's global drift, and a signal mast flies the fleet's peg condition — while the map-wide frame the product is judged on drops from 917 draw calls to 402, and an outage now degrades the harbour instead of emptying it.

Collected from commits `871408a` through `361a03c` after the v0.4.0 changelog entry.

- Made production failure visible and survivable. Client errors now report from every real failure site to a `/_log` that persists them behind an optional KV binding, with the canary POSTing a synthetic report every run to prove the pipe. The edge keeps a long-TTL last-good copy of each endpoint and serves it with honest age headers when upstream fails, the browser persists the last complete world so a returning visitor renders immediately from data labelled with its true age, and the 30-minute canary now asserts per-endpoint freshness so a stuck producer trips it instead of passing.
- Opened the sharing and first-visit loop. The meta description no longer calls the product "A beta desktop RPG island-city", a shared ship link unfurls as that ship through edge-rewritten OG text, the detail panel has a copy-link button, the first-visit legend closes into a "Watch the harbor" button rather than silence, and pressing `/` finds any ship or harbour by name.
- Spent the signals the world had been fetching and ignoring. A signal mast on the observatory terrace flies one pennant per depeg under a storm cone, a cross-bearing buoy rides beside any ship whose DEX price disagrees with the consensus feed, a salt high-water mark bands the lighthouse at the worst PSI band of the trailing 30 days, the beacon's sweep slows across the largest PSI contributor, a tide line reads global 7-day supply as a wet/dry band against a fixed datum, hulls ride high above par and settle below, and each harbour's gulls wheel faster, wider and higher as its chain's supply fills.
- Showed supply being made and unmade. Every signal until now was a stock; the cargo tide adds flow, with crates loaded on the pier deck when a harbour is minting and stacked on the quay's outer edge when it is burning, allocated per coin by chain-presence share and reporting `tracked: false` with a reason rather than a silent zero outside the measured scope. Flight to quality shows as skiffs converging on the titan hulls.
- Raised the frame the product is judged on. Whole-map framing went from 917 draw calls at tier `recovery` and 37.7fps to 402 at tier `full` by culling detail that cannot resolve at that distance, and the headroom paid for mirror reflections under the 29 hero hulls whose strength reads risk region. Hulls, bronze and gilt are now lit by the actual sky dome, island planting is laid in drifts instead of an isotropic spiral, five pale sails became legible without touching DAI's amber, and the warm stripe across the night sky is gone.
- Cut the cost of being left open. Ships hold their tiles across refreshes unless their risk placement actually changed, which stops refresh teleporting and takes the world rebuild from 303ms to 34ms; runtime models are meshopt-compressed from 2,282,072 to 1,133,132 bytes with a maximum geometry shift of 2.44e-4 units; the frame duty halves after three minutes without input; and logo requests stop revalidating on every visit. A real-GPU measurement of the refresh — 0ms, 239ms and 795ms of main-thread work for an identical, a typical and a fully churned payload — ruled out the Web Worker rather than estimating it.
- Made the gates tell the truth and widened what they cover. `npm run preview --assert` is now a deploy gate that fails rather than reports a software frame, the dist visual and perf lanes reach their assertions after years of stale assertions and a fixture ship that never existed, a refresh-soak gate cycles 12 payloads and requires renderer memory to return to baseline, the world-data hook and the enrichment grace path have their first tests, and `check:runtime-media` now validates that referenced media can actually render — which found a logo truncated and rendering blank since the bootstrap commit.
- Made the world's own records readable. The accessibility ledger, previously screen-reader-only, opens as a visible Harbor ledger panel from the footer with byte-identical content, the seven carved sea-name boards became keyboard targets that track their own on-screen scale, and `[` and `]` shift the time of day instead of the cheatsheet telling visitors to hand-edit the address bar.

## v0.4.0 - 2026-07-26 - The Lantern Sea

PharosVille is rebuilt on Three.js and grows into a real place: a four-times sea whose waters have names and coastlines, a fleet that flies its issuers' colours, and a harbour that starts in under two seconds and holds sixty frames a second for as long as you leave it open.

Collected from commits `deed1b3` through `82097d3` after the v0.3.0 changelog entry.

- Rebuilt the world on a Three.js renderer: a volcanic-stone island under an epic Pharos with a volumetric beam and real shadows, a lantern-lit sea with normals, a moon road, light lanes and wakes, a day/dusk/night cycle with AgX tone mapping, bloom and a graded vignette, and ambient life — gulls, fireflies, summit birds and danger weather.
- Grew the sailable sea four times over and gave every body of water a name, a coastline and a carved board standing in it. The bands are no longer ruled lines: Calm Anchorage, Watch Breakwater, Alert Channel, Warning Shoals, Danger Strait, Ledger Mooring and the wreck shoals are places, sized to the traffic they carry, and the sea's place-names left the DOM chips for the world itself.
- Gave the fleet an identity you can read at a glance: seven hull silhouettes with per-ship proportions, ten bespoke hero hulls for the titans, the issuer's colour on the sheer strake, canvas dyed in the issuer's brand with its mark cut from the coin's own logo, pennants at the masthead, and a chain's own flag over each of the eleven harbours.
- Drew the whole fleet from instanced batches, holding roughly nine draw calls for the ships however many there are, and raised the render cap to 320.
- Cut the startup freeze from about seven seconds to well under one. Ship placement was recomputing every already-placed ship for every candidate tile, the entire fleet was being built twice per world build, and the terrain classifier — six noise octaves and fifteen segment SDFs per tile — was never cached. The world now also opens on the two feeds that build it rather than all six, so one slow endpoint no longer holds an empty sea for twenty seconds, and `/api/report-cards` is projected at the edge from 2.98 MB to 1.44 MB.
- Stopped the recurring hitches and the false failures: the ten-minute route rebuild no longer re-runs the whole A* set to reproduce identical paths, a load spike no longer poisons the frame-pacing window and freezes the lighthouse beam, a transient WebGL context loss recovers instead of retiring the world to the DOM overview, and a single thrown frame no longer costs the session.

## v0.3.0 - 2026-07-10 - True Waters

PharosVille learns to tell the whole truth: inverted stability semantics, dead permalinks, and silent story beats are fixed, the harbor finally leads the first visit, and ships sail with honest wakes and cadence.

Collected from commits `c02952a` through `654ea7f` after the v0.2.2 changelog entry.

- Fixed inverted PSI semantics across the world: a healthy BEDROCK market now becalms the ambient sea and a collapse would storm it (previously reversed), the lighthouse 24h drift wording matches reality, the decorative session-hour slider no longer roughens the analytic water, and NAV ledger ships stay moored through CALM stress rows.
- Revived two silently broken features: since-last-visit deltas no longer baseline against the empty loading world, and shared ?sel= permalinks now open the linked ship instead of falling back to the lighthouse.
- Made the world the hero on first visit — one narrow legend (with hull-class thumbnails) over a visible harbor, the lighthouse panel deferred until it closes, Watch Breakwater water retuned to a distinct steel teal, and a quieter footer with the fps counter behind ?debug=1.
- Sharpened inspection: ship panels open with a zone status line and the live signed peg deviation ("-12 bps vs USD") with full ledger parity, the detail panel became a non-modal landmark so screen readers keep the accessibility ledger, keyboard Tab now exits the map-target cycle into the page controls, and nav/yield mast signals gained legend, detail, and ledger explanations.
- Let events read as story: a session harbor log turns risk-band transitions into clickable beats ("USDX left Calm Anchorage for Danger Strait"), legend movers jump to their ships, and placement and area copy speak the observatory voice.
- Tuned interaction-time performance and motion honesty: adaptive DPR now reacts to raster-bound frame pacing instead of upshifting against it, post-pan effect shedding is gone, sail-logo sprites stopped thrashing during zoom, risk tack-outs run at their documented 3-second tempo, routes no longer teleport at 10-minute rebuilds, dock calls follow real chain supply share, and wakes die away as ships settle.

## v0.2.2 - 2026-06-14 - Signal Clarity

PharosVille sharpens ship and harbor identity, expands the weathered maritime world, and trims noisy overlays back to a cleaner inspection surface.

Collected from commits `bd5c201` through `cfab83f` after the v0.2.1 changelog entry.

- Made stablecoin and chain identity easier to read with ship nameplates, logo-safe sail marks, chain-logo harbor flags, titan and heritage hull treatments, and stronger visual chrome for audit, confidence, consensus, backing, and safety signals.
- Expanded the harbor atmosphere with night mode, horizon and world-edge staging, coherent swell fronts, persistent wakes, dock caustics, lighthouse-synchronized ship rim light, threat-aware sky states, DANGER rain squalls, and richer ambient quay detail.
- Improved inspection flows with permalink state, copy-link support, richer PSI/fleet/dock/grave detail facts, since-last-visit context, safety grades, dock-member links back to in-world ships, and a compact footer that keeps the Pharos link last.
- Stabilized dense rendering with per-pass telemetry, ship-body and nameplate caches, deferred asset cache invalidation, far-zoom water and fleet LOD reductions, sustained-motion budgets, and updated runtime facts for the larger visual surface.
- Restored chain and stablecoin logos on harbors and ships after the logo decode path changed, then switched render cache invalidation to logo-load batches so the water no longer blinks while logos stream in.
- Removed the noisy visible movers, DEWS band key, fleet focus controls, and footer status line after overlap and clarity regressions, leaving those signals in details, ledger, and map semantics instead of extra chrome.

## v0.2.1 - 2026-05-18 - Curtain Up

PharosVille opens with a cinematic reveal, fleets that move with intent, and a village that finally feels lived-in.

Collected from commits `adf3993` through `a585208`, with earlier v0.2.0 smoothness work summarized in v0.2.0.

- Added a 1.8-second first-load reveal beat: sky and outer water fade in, the headland slides up, then the lighthouse turns on with a slowed first sweep. Reduced-motion users still get the deterministic final frame instantly.
- Re-skinned the loading state to the canvas palette, with horizon-ship silhouettes and a warm pulsing halo, so the wait between routes matches the world that follows.
- Brought the civic core to life with procedural chimney-smoke wisps, reshuffled vegetation to clear the future agora footprint, and retired the redundant selection-strip caption now that the detail panel carries the same load.
- Reworked fleet movement so ships in calm waters cycle deterministic patrol itineraries, squads fan out at sea and pull tight in port, and risk-band changes show as a tack-out before the next dock cycle.
- Stopped harbor pile-ups with a swell-aware sea-room separation pass and added a cue-priority arbiter so active-risk and recent-supply ships win overlay and wake slots first when render budgets bind.
- Tightened renderer hot paths through cached lighthouse god rays, shared titan foam/spray/mooring templates, Map-backed static cache lookup, and cooperative idle warmup.

## v0.2.0 - 2026-05-17 - Need For Speed

PharosVille became a smoother, faster maritime observatory with richer motion, steadier camera control, stronger rendering budgets, and a real release-history surface.

Collected from commits `009ef1a` through `a538b9f`, plus the 2026-05-17 workspace motion and renderer performance batch.

- Added continuous follow-camera behavior, keyboard target cycling, time controls, and stricter canvas interaction coverage for zoom, bounds, and selected-ship tracking.
- Reworked ship motion sampling with route-path continuity, speed-aware wakes, display velocity, smoother state transitions, map-visibility fades, and reduced heading snap during docking, sailing, and ledger patrols.
- Improved live frame pacing with visual-motion smoothing, a single active motion loop guard, browser perf telemetry, longtask checks, and sustained-motion budget documentation.
- Raised renderer throughput with pan-tolerant static and dynamic layer caches, backing-store budget metrics, cache eviction accounting, deferred asset loading during idle time, and incremental hit-target updates.
- Expanded harbor atmosphere with deterministic sea state, cinematic weather passes, richer lighthouse and ambient drama, water-zone plaques, tighter palette controls, ship identity chrome, and refreshed visual baselines.
- Added the in-app changelog panel and footer fleet counter, then aligned local push, visual, CI, and deploy gates so release checks match the Cloudflare Pages workflow.

## v0.1.3 - 2026-05-17 - Harbor Motion And Atmosphere

The beta map gained a stronger sense of weather, water, and fleet motion while keeping the same stablecoin semantics.

Collected from commits `4940b86` through `800e184`.

- Added deterministic sea-state signals for water, ship, and atmosphere rendering.
- Refined ship heading, docking choreography, lighthouse drama, and harbor life.
- Polished named water-zone borders, plaques, palette separation, and cinematic weather passes.
- Added keyboard target cycling, session time controls, and the footer fleet counter.

## v0.1.2 - 2026-05-04 - Runtime Hardening And Inspection Polish

The standalone route became easier to operate, test, and inspect before publishing.

Collected from commits `88d6a27` through `2205882`.

- Improved detail-panel accessibility, touch targets, contrast checks, and pinch-zoom coverage.
- Added error-reporting categories, asset-miss telemetry, and stricter lint/doc validation.
- Optimized hit testing, terrain rendering, React data churn, and static asset delivery.
- Added visual regeneration and swarm-operation runbooks for safer multi-agent work.

## v0.1.1 - 2026-05-03 - Launch World Buildout

The v0.1 beta surface became a full maritime observatory rather than a prototype canvas.

Collected from commits `c13d6b2` through `d1f8afd`.

- Added launch metadata, canary smoke checks, GA/Cloudflare analytics gates, favicon, and OG cards.
- Introduced the PharosWatch pigeonnier, Telegram harbor landmark, extra birds, and auto day-night controls.
- Expanded the fleet with Ethena squad ships, titan hulls, heritage hulls, route tempo, and supply-change detail facts.
- Reworked harbors, water geography, atmospheric labels, and motion performance for dense inspection.

## v0.1.0 - 2026-05-02 - Foundation, Geometry, And Performance

The first release-ready PharosVille shell was tightened around desktop gating, asset discipline, and the island layout.

Collected from commits `57fdc78` through `3704cc8`.

- Added release-readiness gates, response headers, cross-browser accessibility smoke tests, and visual CI controls.
- Reshaped the island and seawall routing while preserving DEWS water-zone semantics.
- Added Ethereum harbor Yggdrasil, iconographic sail marks, civic vegetation, and logo-colored harbor flags.
- Optimized terrain scans, hit testing, static cache behavior, and manifest-driven sprite loading.

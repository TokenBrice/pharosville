# Changelog

PharosVille release notes are collected from commit history and mirrored into the in-app changelog panel.

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

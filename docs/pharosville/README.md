# PharosVille Maintenance Pack

Last updated: 2026-07-24

These documents maintain the standalone PharosVille app at
`https://pharosville.pharos.watch/`. Current code and the route contract win
over historical plans.

## Start Here

- `AGENT_ONBOARDING.md`: task routing and command lanes.
- `ARCHITECTURE.md`: request flow, world construction, Three.js runtime, and
  fallback boundary.
- `RUNTIME_FACTS.md`: generated constants, inventories, and budgets.
- `CHANGE_CHECKLIST.md`: pre-edit and pre-claim checks.
- `TESTING.md`: focused, browser, performance, and release validation.
- `VISUAL_INVARIANTS.md`: non-negotiable visual and analytical contracts.
- `MOTION_POLICY.md`: the single world clock, reduced motion, and effect caps.
- `ASSET_PIPELINE.md`: current logo/model workflow and archived raster status.
- `PIXELLAB_MCP.md`: reference-image workflow; generated images are not
  automatically runtime assets.
- `RELEASES.md`: protected deploy, tag, GitHub Release, recovery, and audit.
- `KNOWN_PITFALLS.md`: repeat-risk issues.

## Current Summary

PharosVille is a desktop-gated React application with a pure world model under
`src/systems/` and one production Three.js renderer under `src/three/`. The
scene combines procedural geometry and materials with one deterministic
lighthouse GLB. Runtime image loading is limited to same-origin stablecoin
logos; GPU or renderer failure presents an interactive DOM signal overview.

The browser calls same-origin `/api/*` only. The Cloudflare Pages Function owns
the upstream allowlist and secret. Analytical meaning remains available through
the detail panel and accessibility ledger without reading WebGL pixels.

## Plan Lifecycle

- Plans live in `agents/` while active or recently completed.
- Mark delivered plans `Completed` with a dated outcome.
- Completed plans may be deleted after their durable outcomes exist in current
  code or canonical docs.
- Treat an old plan as context only when it conflicts with current code,
  `docs/pharosville-page.md`, or `RUNTIME_FACTS.md`.

## Historical Inputs

Earlier raster and Canvas 2D prototypes are historical design inputs, not
runtime dependencies. The archived raster inventory remains in the repository
for provenance and validation but is not fetched by the current app.

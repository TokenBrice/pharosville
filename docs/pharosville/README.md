# PharosVille Maintenance Pack

Created: 2026-04-28

Goal: maintain durable maintenance, asset, and validation notes for the standalone PharosVille root app. This directory complements the public route contract in `docs/pharosville-page.md`.

## Start Here

- `AGENT_ONBOARDING.md` — task routing, required conventions, and command lanes.
- `CHANGE_CHECKLIST.md` — short pre-edit and pre-claim checklist.
- `RUNTIME_FACTS.md` — generated constants, budgets, inventories, and workflow facts.
- `ARCHITECTURE.md` — API proxy, world model, renderer, and asset flow overview.
- `TESTING.md` — focused checks, visual checks, and broader validation guidance.
- `VISUAL_INVARIANTS.md` — non-negotiable visual/data contracts for the world representation.
- `SCENARIO_CATALOG.md` — canonical fixture and test scenarios for semantic and visual validation.
- `VISUAL_REVIEW_ATLAS.md` — screenshot baselines, browser review entries, and manual pixel checklist.
- `ASSET_PIPELINE.md` — generated/prototype-to-manifest workflow and asset guardrails.
- `PIXELLAB_MCP.md` — PixelLab MCP tool selection, prompting, review, provenance, and promotion workflow for sprite generation.
- `HOOKS.md` — memoization and callback conventions for route hooks and canvas consumers.
- `KNOWN_PITFALLS.md` — repeat-risk issues maintainers should check before claiming completion.

Historical plans are context only. Current code, `docs/pharosville-page.md`,
`RUNTIME_FACTS.md`, and this maintenance pack win over old planning artifacts.

## Plan Artifact Lifecycle

- Plans in `agents/` are active or recent. Treat them as in-flight unless an explicit completion note says otherwise.
- When a plan is delivered or superseded, move the file to `agents/completed/` and prepend a one-line note: `Completed YYYY-MM-DD — <outcome>`.
- Plans older than ten days with no completion note should be considered stale and may be archived or deleted opportunistically.
- When starting new work, scan `agents/` first to avoid duplicating an in-flight plan.

## Historical Inputs

This maintenance pack was originally informed by Pharos API/data documentation
and a separate Canvas 2D prototype. Those source repos are historical context
only; they are not local dependencies for standalone PharosVille work. Use the
files listed in "Start Here" as the current in-repo source of truth.

## Current Working Summary

PharosVille is now an implemented desktop-only standalone app at `https://pharosville.pharos.watch/`. The current app uses a long-side/short-side and orientation gate before mounting world data, a pure world model under `src/systems/`, a Canvas 2D renderer under `src/renderer/`, local manifest-backed raster assets under `public/pharosville/assets/` with required PNG fallbacks and optional WebP twins, and DOM parity through the detail panel and accessibility ledger.

Current source of truth for future maintainers:

1. `docs/pharosville-page.md` for verified user-facing route behavior.
2. `docs/pharosville/AGENT_ONBOARDING.md` for task routing.
3. `docs/pharosville/ARCHITECTURE.md` for implementation orientation.
4. `docs/pharosville/RUNTIME_FACTS.md` for generated constants, budgets, inventories, and workflow facts.
5. `docs/pharosville/CHANGE_CHECKLIST.md`, `ASSET_PIPELINE.md`, and `TESTING.md` for repeatable work.

## Original Verdict

Feasible, but it should be treated as a product surface, not a decorative map. The current implementation is a standalone root app using the world model and renderer under `src/`, inspired by ClaudeVille's Canvas 2D architecture and sprite workflow. Screens whose long side is below `720px` or short side is below `360px` use the desktop-only fallback, and capable portrait screens use the rotate prompt rather than a mobile/tablet canvas. Existing Pharos endpoints are sufficient through the Pages Function proxy without client-side cross-origin API calls.

Independent review originally returned "conditional go" and identified data-contract, accessibility, and performance gaps. Those fixes have been folded into the current route contract and maintenance docs.

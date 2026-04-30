# PharosVille Maintenance Pack

Created: 2026-04-28

Goal: maintain durable maintenance, asset, and validation notes for `/pharosville/`. This directory complements the public route contract in `docs/pharosville-page.md`; use `docs/pharosville/CURRENT.md` for the current implementation map.

## Start Here

- `CURRENT.md` — current source of truth for PharosVille maintenance work, live route entrypoints, invariants, and known boundaries.
- `CHANGE_CHECKLIST.md` — pre-edit and pre-claim checklist for future PharosVille changes.
- `CHANGE_PLAYBOOK.md` — task-type decision tree from request to files, docs, and focused checks.
- `VISUAL_INVARIANTS.md` — non-negotiable visual/data contracts for the world representation.
- `SCENARIO_CATALOG.md` — canonical fixture and test scenarios for semantic and visual validation.
- `VISUAL_REVIEW_ATLAS.md` — screenshot baselines, browser review entries, and manual pixel checklist.
- `KNOWN_PITFALLS.md` — repeat-risk issues maintainers should check before editing or claiming completion.
- `ASSET_PIPELINE.md` — generated/prototype-to-manifest workflow and asset guardrails.
- `PIXELLAB_MCP.md` — PixelLab MCP tool selection, prompting, review, provenance, and promotion workflow for sprite generation.
- `TESTING.md` — route-specific focused checks, visual checks, and broader validation guidance.

Historical plans were intentionally not migrated here. Current code, `CURRENT.md`, and `docs/pharosville-page.md` win over old planning artifacts.

## Historical Inputs

This maintenance pack was originally informed by Pharos API/data documentation
and a separate Canvas 2D prototype. Those source repos are historical context
only; they are not local dependencies for standalone PharosVille work. Use the
files listed in "Start Here" as the current in-repo source of truth.

## Current Working Summary

PharosVille is now an implemented desktop-only standalone app at `https://pharosville.pharos.watch/`. The current app uses a viewport gate before mounting world data, a pure world model under `src/systems/`, a Canvas 2D renderer under `src/renderer/`, local static PNG assets under `public/pharosville/assets/`, and DOM parity through the detail panel and accessibility ledger.

Current source of truth for future maintainers:

1. `docs/pharosville-page.md` for verified user-facing route behavior.
2. `docs/pharosville/CURRENT.md` for implementation orientation and maintenance guardrails.
3. `docs/pharosville/CHANGE_CHECKLIST.md`, `ASSET_PIPELINE.md`, and `TESTING.md` for repeatable work.

## Original Verdict

Feasible, but it should be treated as a product surface, not a decorative map. The current implementation target is a full visual replacement using the standalone world model and renderer under `src/`, inspired by ClaudeVille's Canvas 2D architecture and sprite workflow. Screens below `1280px` are a desktop-only fallback for v0.1, not a mobile/tablet canvas. Existing Pharos endpoints are sufficient through the Pages Function proxy without client-side cross-origin API calls.

Independent review originally returned "conditional go" and identified data-contract, accessibility, and performance gaps. Those fixes have been folded into the current route contract and maintenance docs.

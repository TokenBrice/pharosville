# PharosVille Maintenance Guide

Last updated: 2026-10-14

Current code and route contracts win over historical plans. Use this directory
for durable operational guidance; use `agents/` for plans and handoffs, not as
an alternative source of runtime truth.

## Start with the document for the change

| Need | Read |
| --- | --- |
| Find the right lane and first check | `AGENT_ONBOARDING.md` |
| Understand app/data/renderer boundaries | `ARCHITECTURE.md` |
| World meaning, art direction, circuits, minimal UI | `../../agents/2026-10-13-pharosville-reboot/PLAN.md` (D1-D14) |
| Runtime, access, security, or budgets | `CONTRACTS.md` |
| Select and interpret validation | `TESTING.md` |
| Read generated limits and inventories | `RUNTIME_FACTS.md` |
| Deploy, monitor, recover, or rotate credentials | `OPERATIONS.md` |
| Create a versioned release | `RELEASES.md` |

`CHANGE_CHECKLIST.md` is the compact pre-edit and handoff checklist.
`SECURITY_HEADERS.md` and `GITHUB_MEDIA.md` are focused reference material.

## Runtime summary

PharosVille is The Harbour: a lighthouse harbour town where every stablecoin is
a boat sailing a circuit between its chains' piers, docking longest where it
holds the most supply. The lighthouse beam is the Pharos Stability Index; sea
state, weather and fog carry off-peg share, stress signals and stale data.
`src/harbour/` holds one three.js WebGL2 `Engine` (`engine/`), ordered world
systems (`systems.ts`), the same-origin data feed, model and sim (`data/`,
`model/`, `sim/`) and the chart-paper UI (`ui/`); `src/harbour/app/` is the
production mount. The desktop gate runs before any of it loads. If WebGL2
cannot start, the first-paint poster stays up with the guide and Pharos links.

## Maintenance rules

- Browser requests stay same-origin `/api/*`; `PHAROS_API_KEY` stays server-side.
- Keep motion deterministic, water-safe, and shared by rendering, hit testing,
  selection, follow, and debug surfaces.
- Keep runtime images same-origin and in the checked media pipeline.
- Judge looks and frame time only on the real GPU: `npm run preview`
  (`scripts/harbour/shot.mjs`), never a Playwright browser.
- Plans may be deleted once their durable outcome exists in code or these docs.
- Do not commit generated output, test results, scratch captures, or local env
  files.

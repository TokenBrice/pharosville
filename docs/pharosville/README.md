# PharosVille Maintenance Guide

Last updated: 2026-09-02

Current code and route contracts win over historical plans. Use this directory
for durable operational guidance; use `agents/` for plans and handoffs, not as
an alternative source of runtime truth.

## Start with the document for the change

| Need | Read |
| --- | --- |
| Find the right lane and first check | `AGENT_ONBOARDING.md` |
| Understand app/data/renderer boundaries | `ARCHITECTURE.md` |
| Change Three.js, interaction, frame lifecycle, or GPU work | `THREEJS_AGENT_REFERENCE.md` |
| Change world meaning, motion, or visual behavior | `VISUAL_INVARIANTS.md` |
| Change model, texture, sail, or flag media | `ASSET_PIPELINE.md` |
| Select and interpret validation | `TESTING.md` |
| Read generated limits and inventories | `RUNTIME_FACTS.md` |
| Deploy, monitor, recover, or rotate credentials | `OPERATIONS.md` |
| Create a versioned release | `RELEASES.md` |

`CHANGE_CHECKLIST.md` is the compact pre-edit and handoff checklist.
`SECURITY_HEADERS.md` and `GITHUB_MEDIA.md` are focused reference material.

## Runtime summary

PharosVille is the Seven-Water Garden: a finite water-led plate framed by an
irregular rim with two openings, shore-station coves, a tsukiyama lighthouse
island, six fleet families, and leg-based voyages. Its pure world model lives
in `src/systems/`, with one production Three.js renderer in `src/three/` and a
thin engine-neutral boundary in `src/renderer/`.
The desktop gate runs before desktop data, logos, models, or the renderer load.
The full eligible fleet renders through capacity-bounded instancing; analytical
meaning remains in DOM details and the accessibility ledger. GPU failure falls
back to a DOM signal overview, never another graphics stack.

## Maintenance rules

- Browser requests stay same-origin `/api/*`; `PHAROS_API_KEY` stays server-side.
- Keep motion deterministic, water-safe, and shared by rendering, hit testing,
  selection, follow, and debug surfaces.
- Keep runtime images same-origin and in the checked media pipeline.
- Keep the rim, seven-water field, station topology, conservative water-safety
  field, and leg samples authoritative across rendering, hit testing, and DOM
  parity. Use `garden-draw-census.ts` plus real-GPU `npm run preview` when
  measuring the approximately 245-call/43-texture default budget.
- Plans may be deleted once their durable outcome exists in code or these docs.
- Do not commit generated output, test results, scratch captures, or local env
  files.

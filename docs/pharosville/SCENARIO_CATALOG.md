# PharosVille Scenario Catalog

Last updated: 2026-07-24

Use these scenarios to select the smallest meaningful validation lane.

| Scenario | Contract | Primary check |
| --- | --- | --- |
| World construction | deterministic lighthouse, docks, ships, areas, cemetery, details | `npm test -- src/systems` |
| Garden Observatory slice | 20 representative ships, full docks/areas, transient selected outsider | `npm test -- src/systems/garden-observatory-slice.test.ts` |
| Three.js lifecycle | create, render, replace world, semantic detail, dispose | `npm test -- src/three/world-renderer.test.ts` |
| Lighthouse artifact | GLB hash, dimensions, anchors, model cache, procedural fallback contract | `npm run check:garden-models` |
| Logo identity | livery, decoded logo, high-contrast matte, symbol fallback | `npm test -- src/three/garden-sail-texture.test.ts` |
| Harbor geography | dock-derived districts and Ethereum/L2 causeways | `npm test -- src/three/garden-harbor-life.test.ts` |
| Ambient life | exactly nine deterministic instanced gulls; reduced/constrained behavior | `npm test -- src/three/garden-harbor-life.test.ts` |
| Water | bounded shader displacement, day cycle, shore and beacon uniforms | `npm test -- src/three/garden-water.test.ts` |
| Interaction | pan, zoom, selection, search, deep links, follow, Escape | `npm run test:visual` |
| DOM parity | details, accessibility ledger, labels, announcements | `npm run test:visual` |
| Observe | risk, growth, concentration sequence and interruption | `npm run test:visual` |
| Reduced motion | static time-zero world and no continuous RAF | `npm run test:visual` |
| Blocked viewport | no data, Three.js module, GLB, or logo requests | `npm run check:viewport-gate` |
| GPU failure | hidden WebGL surface plus selectable `WorldStaticOverview` | `npm test -- src/components/world-static-overview.test.tsx` |
| GPU resources | pacing, startup, long tasks, draw inventory, long-session stability | `npm run test:perf` |
| Reference hardware | strict performance gate on the operator machine | `npm run test:perf:reference` |
| Bundle | required renderer chunk and aggregate size | `npm run build && npm run check:bundle-size` |
| Docs | paths, commands, runtime facts, viewport and security guards | `npm run validate:docs` |

## Data Scenarios

Keep unit fixtures for:

- missing, stale, and fresh PSI/DEWS evidence;
- active depeg precedence;
- NAV ledger placement;
- chain presence with and without a rendered dock;
- zero or incomplete API payloads;
- titan, heritage, squad, and ordinary ships;
- selected ships outside the representative overview;
- cemetery and TON dispatch data.

Do not add invented production fallback market data to make a scenario render.

## Browser Matrix

Chromium is the main visual and reference-performance browser. Firefox is the
required second browser for interaction/accessibility confidence. Safari is
not a cutover acceptance browser.

Run browser tests with deterministic API fixtures, wall-clock hour, viewport,
screen capability, and reduced-motion preference. Do not update evidence merely
to hide unexplained visual drift.

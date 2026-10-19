# PharosVille Architecture

Last updated: 2026-10-19

PharosVille is The Harbour: a desktop-gated React shell around one imperative
three.js WebGL2 world (`src/harbour/`). Every stablecoin is one boat sailing a
circuit between its chains' piers, docking longest where it holds the most
supply; the lighthouse beam is the Pharos Stability Index; sea state, weather
and fog carry off-peg share, stress signals and stale data. The world carries
the meaning; text appears only on demand (hover tag, side panel, ledger).
Decisions D1-D14 live in `agents/2026-10-13-pharosville-reboot/PLAN.md`.
Since v1.2.0 the town, civic buildings and fleet share the Pharos's era (a
Ptolemaic Mediterranean harbour, ancient hulls); that restyle changed art only,
no data mapping (`agents/2026-10-15-classical-town/PLAN.md`). The civic and
hull GLB node names the runtime relies on are checked by
`npm run check:harbour-contracts`.

## Request and loading boundary

```text
Browser → /api/<allowlisted read path> → Pages Function → PHAROS_API_BASE
```

`src/main.tsx` is the tiny same-origin, pre-React admission owner. It uses
`src/systems/viewport-gate.ts` to admit only the sorted 720×600 size profile
(desktops, laptops, unfolded foldables, tablets) on **both** the physical screen
and the current window. These are size tests, never orientation tests. Only
then does it activate the inert `data-pv-preload` HTML hints and import
`react-entry.tsx`, which mounts the gated React client and Harbour app. A
blocked viewport keeps the useful static welcome, guide and links without
React, three.js, GLBs, logos or world/API data. Admission changes cancel stale
imports, unmount the old world and restore the poster for readmission.

One build-time asset registry (`scripts/harbour/build-asset-registry.mjs`,
emitted as `/asset-registry.json`) feeds HTML hints, rewritten media references,
manifests and runtime loaders. Production media, fonts, posters and arrival CSS
use `/harbour/_immutable/<24-character SHA-256 prefix>/...` with one-year
immutable caching; stable HTML and the registry revalidate. Lossless kit and
civic packs replace the 49 eager kit and 17 civic GLB requests. GLBs, packs and
the exact sea transport use precompressed Brotli with real
`Content-Encoding: br`: the browser HTTP stack decodes them, not a JavaScript
Brotli inflater.
Development retains the gzip/JS-inflate GLB and WebP sea paths. Per-engine
`AssetStore` JSON promises deduplicate manifest fetches and parses; validated
pack buffers are released after their entries have been parsed.

The deploy retention step carries exactly the immediately preceding release's
hashed objects into the current artifact, verifying stored-body hashes and
sizes. The two-release window and retained-artifact rollback procedure are
owned by `OPERATIONS.md`; a dashboard rollback cannot add newer objects to an
older immutable deployment. The Pages Function alone reads `PHAROS_API_KEY`;
browser code calls same-origin `/api/*` only. API projection keeps the full
world/panel contract and truth metadata; projected ETags and conditional
responses are specified in `CONTRACTS.md`.

## First paint

`index.html` paints a full-window poster (an illustration with no live numbers)
outside the React root, with the arrival card and CSS resolved through the
asset registry. `HarbourApp` subscribes to this mount's `Engine.onRendered`:
a successful arrival needs the committed model's prepared `readiness` revision
and boat count to match the actual `fleet-frame` report in a completed composer
frame. A valid zero-boat model is ready too, with explicit no-boats copy.

The approved pending-data trial holds the poster for **2 s from the first
completed-render callback**, not navigation or engine construction. If the
stablecoins request is still pending, the next boatless completed frame at or
after that deadline can reveal the world with “Waiting for the fleet’s
readings.” A successful request still preparing its fleet cannot bypass
readiness through this deadline. DataSystem installs the prepared model/plan/pose
atomically off-frame, then FleetSystem submits the whole fleet together. A failed first
request or failed initial planning worker reveals the boatless base world
with honest unavailable copy, never placeholder boats or decorative fog.
After an install, worker loss holds installed readings with their real aging;
it does not run a synchronous main-thread planner.

The existing 1100 ms crossfade is unchanged. Deferred life/identity chunks can
make people, gulls and sea labels arrive later (the second approved trial).
Detail panels/search/ledger start preloading at reveal; app-owned analytics
waits for the shell timer. `src/harbour/app/README.md` owns the detailed
admission, reveal and lazy-module contracts. If WebGL2 cannot start, the poster
stays up with the guide and links. The shell has no inline script, so the CSP
pins no script hash.

## Runtime pipeline

```text
HarbourFeed (/api/*, per-endpoint cadence) → off-frame model/worker preparation
  → atomic model + sim + readiness publication
  → Engine frame: ordered updates → fleet-frame → static depth prepass → post chain → canvas
  → overlay UI (React root in src/harbour/ui/) reads services, never the scene
```

- `engine/`: `Engine` (renderer, scene, perspective camera on the bounded
  `CameraRig`, `TimeOfDay`, `AssetStore`, pmndrs `PostChain` with bloom, AgX
  and SMAA, `QualityGovernor` for resolution and effect tier), shared
  `WorldUniforms`, and the preparation service (`engine/prepare.ts`). Systems
  implement `WorldSystem` and expose services through `ctx.services`.
- `systems.ts`: the ordered registry. Season, layout, data, readings, weather,
  sky, ocean, island, lighthouse, civic, fleet, deferred life, deferred identity,
  lights, beam.
- `data/`, `model/`, `sim/`: the same-origin feed (last good payload per
  endpoint, freshness from `_meta` and headers), the pure model, versioned
  compact layout seeds and persistent planning worker. Task-owned preparation
  installs coherent model/routes/first pose and publishes `readiness`; there
  is no frame-owned fallback planner. Monotonic request/revision ownership
  rejects late results. `simulation-status` distinguishes initial planning
  failure from genuine pending data; `fleet-frame` reports the installed
  revision actually posed/submitted, not desired readiness counts.
- `readings/`: binds PSI, off-peg share, DEWS and staleness to the beam, sea
  state, storm cones, tide gauge and fog.
- `sky/`, `ocean/`, `world/`, `fleet/`, `lights/`, `beam/`: the picture, from
  `public/harbour/` assets (island and lighthouse GLBs, boat kit, sea SDF,
  emblem atlas).
- `ui/`: the chart-paper overlay (corner mark, hover tag, side panel, ledger,
  search, chart labels) on its own React root, mounted by `ui/mount.tsx`.
- `app/`: the production mount and the poster crossfade. `harbour.html` +
  `main.ts` are the dev-only standalone entry.
- Shader preparation compiles against the real composer target and light state,
  including post/private/shadow passes. It uses bounded, cancellable batches
  and preparation-owned material variants, restoring live renderer/material
  state before awaits. The governor keeps the current tier drawing while one
  adjacent tier prepares, then publishes the tier atomically.
  Resolution-only changes skip preparation; seasonal and late-material changes
  invalidate prepared state. KHR completion waits race cancellation; timed-out
  idle callbacks still receive a bounded 4 ms submission slice. Preparation has
  a 30 s deadline: an active, non-superseded timeout warns once and retains the
  partial batch so scenery can appear, with possible synchronous first-use
  compilation. Without KHR, driver compilation can also block. Preparation is
  therefore an optimization, not a universal non-blocking guarantee.
- The static island/civic depth prepass uses an explicit contributor registry,
  not global scene visibility swaps. Its depth variants preserve colour-pass
  transforms, sidedness and seasonal/procedural discard; unsupported or
  non-target objects remain outside it. The prepass clears/writes depth before
  the main colour draw, preserving that depth for the composer scene.
  Kit shadow twins are attached during preparation, but compile leaf-fall
  noise/discard only in the bare seasonal variant (`leafFallAt > 0.001`),
  matching the legacy shadow activation boundary. Keeping a no-op discard in
  summer disables inexpensive opaque depth rendering on some integrated GPUs.
- `?prof=gpu` enables per-pass GPU profiling with reusable completed-query rings
  and frame/state tags. It disables the governor's competing GPU query so
  elapsed-time queries do not nest; unavailable/disjoint samples are not
  invented. This is measurement tooling, not an alternate rendering mode.

## Contracts and budgets

Bundle caps are enforced by `npm run check:bundle-size`
(`scripts/bundle-budgets.mjs`) and listed in `RUNTIME_FACTS.md`. Frame time and
looks are judged only on the real GPU with `npm run preview`
(`scripts/harbour/shot.mjs`); see `TESTING.md`.

## Validation

```bash
npx vitest run src/harbour
npm test
npm run check:viewport-gate
npm run validate:docs
npm run test:visual
npm run preview -- --url http://localhost:5173/
```

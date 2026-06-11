# PharosVille Architecture (Light)

Text + ASCII overview of the four moving parts an agent needs in their head before
editing the renderer, world model, Pages Function, or asset manifest. This is the
deliberately lightweight version; a full SVG/Mermaid upgrade was deferred by
the May 4 Optimizantus health-checkup plan.

For task routing, see `docs/pharosville/AGENT_ONBOARDING.md`. For asset/cache
specifics, see `docs/pharosville/ASSET_PIPELINE.md`.

## 1. Request Flow

Browser code only ever calls **same-origin** `/api/*`. The Pages Function holds the
upstream secret and the endpoint allowlist.

```
+------------------+        same-origin        +------------------------------+
|     Browser      | ------------------------> |  Cloudflare Pages Function   |
|  (React + Canvas)|       /api/<path>         |  functions/api/[[path]].ts   |
+------------------+                           +------------------------------+
        ^                                                      |
        | application/json                                     | HTTPS + X-API-Key
        | (forwarded headers + security policy)                v
        |                                          +------------------------+
        |                                          |   PHAROS_API_BASE      |
        |                                          |   https://api.pharos   |
        |                                          |   .watch (allowlisted) |
        |                                          +------------------------+
        |
        | edge cache hit short-circuits before upstream fetch
```

Boundary rules (enforced in `functions/api/[[path]].ts`):

- `PHAROS_API_KEY` is a Cloudflare Pages secret. **Server-side only.** Never
  shipped in client JS, HTML, query strings, logs, fixtures, or docs.
- `PHAROS_API_BASE` must equal `https://api.pharos.watch` (exact match).
- Allowlist: only paths in `PHAROSVILLE_API_CLIENT_ENDPOINTS`
  (`shared/lib/pharosville-api-client-contract.ts`) are proxied. Anything else
  returns 404 before any upstream call.
- Method: `GET` only. Anything else returns 405.
- Edge cache is keyed on `pathname + search`; per-endpoint `metaMaxAgeSec`
  controls the `Cache-Control` injected when upstream omits one.
- Security headers (CSP, COOP/CORP, HSTS, etc.) are added on every response by
  `withSecurityHeaders`.

## 2. World Model Construction

API response data is reshaped into a pure, frame-stable `PharosVilleWorld` value
object before the renderer ever runs.

```
+-------------------+       +---------------------+       +---------------------+
|  React Query      |       |  use-pharosville-   |       |  buildPharosVille-  |
|  hooks            | ----> |  world-data         | ----> |  World()            |
|  (useStablecoins, |       |  (src/hooks/...)    |       |  (src/systems/...)  |
|   useChains, ...) |       |  - completeness     |       |  - layout           |
+-------------------+       |  - freshness/stale  |       |  - squads, seawall  |
                            |  - routeMode select |       |  - unique ships     |
                            +---------------------+       +---------------------+
                                       |                            |
                                       |    PharosVilleWorld value  |
                                       v                            v
                            +-----------------------------------------------+
                            |  drawPharosVille(input)                        |
                            |  src/renderer/world-canvas.ts                  |
                            +-----------------------------------------------+
```

Key points:

- The hook holds the **last complete world** in a ref so transient incomplete
  fetches don't flicker the canvas (`completeWorldRef`).
- `routeMode` in `loading | error | world` drives the DOM loading/error chrome
  and detail facts. The desktop wrapper still passes the retained `world` value
  into the renderer so the base scaffold can remain painted during transient
  loading or error states.
- `world` is recomputed via `useMemo` keyed on `worldInputSignature`; TanStack
  Query returns stable `data` references on unchanged content, so the signature
  and memo avoid route-loop churn across background polling.

## 3. Renderer Pass Order

`drawPharosVille` (`src/renderer/world-canvas.ts`) runs every frame in this
order. Heavy static scene work is cached, while motion-critical water accents,
ships, hit targets, and selection cues stay live so camera and ship motion share
one displayed frame.

```
sky                          [drawSky]
├── static pass: terrain     [paintStaticTerrainPass — cached]
├── continuous water accents [drawWaterTerrainAccents + shoreline details]
├── atmospheric fade
├── static pass: scene       [paintStaticScenePass — cached]
│     harbor ground -> backgrounded docks -> yggdrasil ->
│     cemetery ground -> center cluster -> lighthouse headland ->
│     cemetery context
├── lighthouse surf
├── lighthouse reflection
├── entity pass               [drawEntityLayer — z-sorted]
│     scenery, foreground docks, ships (body/wake/overlay),
│     graves, lighthouse body/overlay, pigeonnier
├── squad chrome              [pennants + selection halo per squad]
├── scheduled cloud shadows
├── water area labels
├── night tint                [drawNightTint, by skyState.nightFactor]
├── ambient atmosphere        [atmosphere, lighthouse highlights,
│                              bioluminescence, moon reflection,
│                              sea mist, decorative lights]
├── lighthouse beam rim + god rays
├── cemetery mist
├── birds
├── weather (lightning)       [after night-tint so flashes punch through]
├── night vignette
└── selection chrome          [drawSelection]
```

Cache layers:

- **Static caches**: `terrain` and `scene`. They are keyed by camera bucket,
  dpr, world id, asset-load tick, and `manifestCacheVersion`. The terrain cache
  includes static water texture/detail; only wave, shimmer, caustic, and
  shoreline accents draw live.
- **Sprite cache**: precomposed ship bodies for base hull, tint, trim, and
  stable identity accent. Pose, wake, selection, hover, route, and data-state
  overlays remain live.
- **Shared backing budget**: main canvas, static offscreens, dynamic offscreens
  if any return, and ship-body sprite cache pixels all count against
  `MAX_TOTAL_BACKING_PIXELS` in `src/systems/canvas-budget.ts`. The render
  metrics expose `staticCachePixels`, `dynamicCachePixels`, `spriteCachePixels`,
  cache entry counts, total backing pixels, and over-budget pixels.

The render scheduler in `src/renderer/render-scheduler.ts` derives
`full | interaction | constrained | recovery` from camera intent, recent draw
duration, frame-pacing p90, and reduced-motion state. It only degrades or skips
decorative passes such as film grain, birds, cloud shadows, sparkles, moon
reflection, sea mist, decorative lights, and god rays. Analytical layers,
interaction-critical overlays, water accents, entities, labels, selection, and
weather stay live.

## 4. Asset / Cache Invalidation

Three independent inputs feed the static-layer cache key. Bumping any one
forces a repaint of the cached scene/terrain offscreens.

```
public/pharosville/assets/manifest.json
        |
        | (Vite plugin emits the runtime variant alongside)
        v
manifest.runtime.json (build-time output, served from /pharosville/assets/)
        |
        | loaded by AssetManager at boot
        v
manifestCacheVersion(manifest)   <-- style.cacheVersion (schema v2) /
        |                            style.assetVersion (schema v1)
        |
        | folded into the static-layer cache key:
        v
   "<scope>|<cameraKey>|a<assetLoadTick>|cv<manifestCacheVersion>"
```

Implications:

- Adding/replacing a sprite **and** wanting the offscreen caches to drop
  requires bumping `style.cacheVersion` in `manifest.json`. The asset URL also
  carries `?v=<cacheVersion>` so the browser HTTP cache invalidates in step
  (`assetUrl()` in `src/systems/asset-manifest.ts`).
- `AssetManager` prefers validated WebP twins when present and falls back to the
  required PNG path. The runtime manifest is generated from the authoring
  manifest, so edit `manifest.json`, not `manifest.runtime.json`.
- `assetLoadTick` (from `getAssetLoadProgressKey()`) bumps as new sprites
  finish decoding, so the cache repaints once per progress step during boot
  and then settles.
- Authoring-only fields (`prompt*`, `semanticRole`, `criticalReason`,
  `paletteKeys`, `tool`) are stripped from the runtime manifest by the Vite
  plugin; only `manifest.json` keeps them for validators and tooling.

See `docs/pharosville/ASSET_PIPELINE.md` for the manifest editing workflow and
`docs/pharosville/PIXELLAB_MCP.md` for sprite generation/promotion.

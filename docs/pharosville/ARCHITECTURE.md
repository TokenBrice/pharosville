# PharosVille Architecture (Light)

Text + ASCII overview of the four moving parts an agent needs in their head before
editing the renderer, world model, Pages Function, or asset manifest. This is the
deliberately lightweight version; a full SVG/Mermaid upgrade is deferred (see
`agents/health-checkup-2026-05-04/00-implementation-plan.md` § Deferred).

For runtime-state details, see `docs/pharosville/CURRENT.md`. For asset/cache
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
- `routeMode` ∈ `loading | error | world`. The renderer only paints the full
  scene when `routeMode === "world"` and data is complete.
- `world` is recomputed via `useMemo`; TanStack Query returns stable `data`
  references on unchanged content, so the memo hits across re-renders.

## 3. Renderer Pass Order

`drawPharosVille` (`src/renderer/world-canvas.ts`) runs every frame in this
order. Static and dynamic passes are cached separately to keep the per-frame
cost predictable on desktop.

```
sky                          [drawSky]
├── static pass: terrain     [paintStaticTerrainPass — cached]
├── dynamic pass: water      [paintDynamicWaterPass — phase-bucketed cache]
├── static pass: scene       [paintStaticScenePass — cached]
│     harbor ground -> backgrounded docks -> yggdrasil ->
│     cemetery ground -> center cluster -> lighthouse headland ->
│     cemetery context
├── lighthouse surf
├── entity pass               [drawEntityLayer — z-sorted]
│     scenery, foreground docks, ships (body/wake/overlay),
│     graves, lighthouse body/overlay, pigeonnier
├── squad chrome              [pennants + selection halo per squad]
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

- **Static caches** (`STATIC_CACHE_MAX = 4`): `terrain`, `scene`. Keyed by
  camera bucket, dpr, world id, asset-load tick, and `manifestCacheVersion`.
- **Dynamic cache** (`DYNAMIC_CACHE_MAX = 4`): `water-overlays`. Same camera
  key plus a phase bucket (10 Hz under normal motion, 0 with reduced motion).

## 4. Asset / Cache Invalidation

Three independent inputs feed the static-layer cache key. Bumping any one
forces a repaint of the cached scene/terrain offscreens.

```
public/pharosville/assets/manifest.json
        |
        | (Vite plugin emits the runtime variant)
        v
public/pharosville/assets/manifest.runtime.json
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
- `assetLoadTick` (from `getAssetLoadProgressKey()`) bumps as new sprites
  finish decoding, so the cache repaints once per progress step during boot
  and then settles.
- Authoring-only fields (`prompt*`, `semanticRole`, `criticalReason`,
  `paletteKeys`, `tool`) are stripped from the runtime manifest by the Vite
  plugin; only `manifest.json` keeps them for validators and tooling.

See `docs/pharosville/ASSET_PIPELINE.md` for the manifest editing workflow and
`docs/pharosville/PIXELLAB_MCP.md` for sprite generation/promotion.

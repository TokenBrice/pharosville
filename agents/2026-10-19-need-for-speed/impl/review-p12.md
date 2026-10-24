# Independent review — Need for Speed phases 1–2 (`main..d829f950`)

Read-only review of the committed range (working-tree/phase-3 edits excluded). Every finding cites
file:line as read at `d829f950`. "Exact" claims below were checked against the old code, not assumed.

## Blockers

### B1 — Planning-worker failure before first install leaves the world behind the poster forever
- `src/harbour/sim/system.ts` `prepare()`: `if (this.workerFailed && !this.installedPayloads) { this.dirty = false; return; }`
  (the early-return guard inside `prepare`, just after the `sim/feed/layout/warm` capture).
- `src/harbour/sim/warm-legs.ts:14-15` — worker failure rejects `done` and every `prepare`; there is
  deliberately **no main-thread fallback** ("Failures reject every waiter. They never authorize
  animation-frame fallback computation.").
- Consequence chain: worker fails (blocked worker, 404 on the hashed worker/seeds chunk, browser
  policy, `postMessage` clone failure) → `DataSystem.prepare()` clears `dirty` and returns forever →
  `readiness.prepared` stays `false`, `model.boats` stays `0`, `ctx.services.get("model")` keeps the
  empty awaiting model.
- The reveal in `src/harbour/app/harbour-app.tsx:79-94` then has **no exit**: `complete` is false
  (never prepared); `snapshot?.data === null` is false when `/api/stablecoins` succeeded;
  `snapshot === undefined` is false once the feed attempted it. The arrival poster never crossfades;
  the copy stays "Raising the harbour." indefinitely with a fully working base scene behind it.
- Why it matters: availability + data honesty. The old code had an in-frame fallback (the bug Lane A
  set out to remove); the new design removes the fallback but also removes every honest terminal
  state for this failure. Not reproducible on a healthy dev machine; exactly the tail the plan
  says to prove ("prove worker startup, result delivery and adopted revision on every supported
  browser").
- Fix (any one, with tests): (a) surface a terminal arrival state ("The harbour simulation could not
  start") when `workerFailed && !installedPayloads` and reveal the boatless scene without claiming
  readings are live; or (b) allow the *first* plan to be built on the main thread inside the
  preparation task (it is a task, not a frame — this keeps NFS-001's "no fallback compute inside a
  frame" invariant); or (c) retry worker startup with backoff and an honest interim copy.

## Major

### M1 — A material disposal during deferred-system preparation silently disposes life/identity for the session
- `src/harbour/engine/engine.ts` `initLater()` catch: `if (!isPreparationAbort(error)) console.error(...); s.dispose(this.ctx);`
  — the system is disposed **unconditionally**, and for preparation aborts the error is not even logged.
- `src/harbour/engine/prepare.ts` `prepare()`: `source.addEventListener("dispose", cancel)` (line ~214)
  makes **any live material disposal** abort an in-flight preparation, and `prepareGroup` rethrows the
  abort when the epoch did not change (`catch { if (!isPreparationAbort(error) || this.disposed || epoch === this.epoch) throw error; }`).
- So a season/pattern/fleet-reconcile material disposal that lands while `initLater` is preparing the
  life or identity group permanently removes people/gulls/labels/crest scenery with no console trace
  and no retry. Also, on that throw the `additions` visibility-restore loop is skipped, so any objects
  already added stay `visible = false` until the system's own dispose removes them.
- Why it matters: unintended scenery loss (the product), silent. The governor's world-preparation loop
  retries the same error correctly (`engine.ts` `setPreparation` while-loop); only the `initLater`
  path is unguarded.
- Fix: in `initLater`, retry `prepareGroup` on `isPreparationAbort` while `!disposed && !aborted`
  (mirror the governor loop), and only dispose on non-abort errors (with the error logged). Ensure the
  `additions` visibility restore runs in a `finally`.

### M2 — The critical-path island GLB is preloaded with `fetchpriority: "low"`
- `scripts/harbour/build-asset-registry.mjs:108`: `...(original === "/harbour/island.glb" ? { fetchpriority: "low" } : {})`.
- The plan's own load model (PLAN.md §2) makes `island.glb` (2.56 MB, ends ~4.3 s) the geometry
  frontier the first fleet frame waits on; every other first-frame preload gets the default priority.
  Deprioritizing the largest gating asset behind React/world chunks and the kit/civic packs risks
  *delaying* the headline cold-load metric (modeled ~5.0 s target).
- If the intent was to let small manifests/chunks win the connection first, that trade needs the quiet
  interleaved A/B before it ships; otherwise drop the override. Please confirm intent + measurement.

### M3 — The reveal's "entire fleet drew" comparison is tautological and documents a guarantee it does not provide
- `src/harbour/engine/engine.ts` `recordRendered()` copies `readiness.revision/boats` into
  `this.rendered` immediately after `composer.render()`, then `publishStats()` invokes listeners with
  that copy; `src/harbour/app/harbour-app.tsx:79-81` compares `rendered.revision === readiness.revision
  && rendered.boats === readiness.boats && model.boats.length === readiness.boats` — all three compare
  one object against itself (or against the value it was assigned from). The NFS-053 invariant
  ("reveal only after a composer-completed frame of the committed revision's complete fleet pose")
  is actually enforced by *ordering*: `DataSystem.prepare()` publishes model+readiness in a task, and
  `FleetSystem.update()` reconciles and uploads in the next frame before `composer.render()`. That
  ordering is correct today, but the check reads as protection and will mislead the next editor.
- Fix (small): have the fleet report the instance/boat count it actually posed this frame (it already
  tracks `posed`), publish that via `onRendered`, and compare against `readiness.boats`; or delete the
  redundant comparisons and state the ordering contract in a comment.

## Minor

1. **304 on the stale last-good path** — `functions/api/[[path]].ts` `staleLastGoodResponse` sets
   `Warning: 110` + `cache-control: no-store`, then `conditionalResponse` may still answer `304`
   against a matching `If-None-Mastch`/`pv1-*` ETag (lines ~263, ~271). RFC 9111 header merging should
   propagate the `Warning`/`x-data-age` onto the browser's stored copy so `src/lib/api.ts` demotes it,
   but this is subtle and browser-dependent (Safari lane). Verify once on the live CDN that a stale
   304 actually demotes the client's freshness state; if not, skip `conditionalResponse` for the
   stale path (always send the body + warning).
2. **First-click blank for lazy detail panels** — `src/harbour/ui/App.tsx:39-41` renders
   `Suspense fallback={null}`; `preloadDetails()` only starts 1200 ms after the reveal
   (`src/harbour/app/harbour-app.tsx:70`). A click landing before the chunk finishes opens
   Ledger/Search/panel as *nothing* until it arrives. Operator decision 9 requires "no noticeable
   first-click delay" — the filmstrip must include an early-click arm; consider a minimal skeleton
   fallback instead of `null`.
3. **Fleet offscreen pose-skip is inert whenever the fleet casts shadows** —
   `src/harbour/fleet/fleet-system.ts` `poseHull = b.wrecked || this.debug !== null || mesh.castShadow
   || frustum.intersectsSphere(...)`: `mesh.castShadow` is the whole-mesh flag and is on in production,
   so every hull is posed every frame and NFS-057's skip never engages (correct, just no gain). If the
   intent was distance-gated shadow contribution, the condition needs the shadow camera's frustum, not
   the static flag — confirm intent.
4. **Vite registry rewrite drops sourcemaps** — `vite.config.ts` `transform()` returns `map: null`
   while `replaceAll` changes token lengths, so built sourcemaps for rewritten files are wrong. Debug-only
   cost; return `{ code, map: null }` is fine, but note it or use magic-string.
5. **Projection verification gap** — I verified the projected fields cover every world/UI read I
   found (`model/build.ts`, `readings.ts`, `Panel.tsx` incl. the identical history filter/sort/slice,
   `civic/flows.ts`, `facts.ts`, `world-payload-guard.ts` was co-updated). I did not exhaustively
   prove absence of reads of the dropped upstream extras (`price`, `globalTotalUsd`,
   `unattributedTotalUsd`, `dominanceShare`, `healthBand`, `computedAt`, mintBurn `gauge`). They are
   `Partial` in `model/types.ts` and grep found no consumer; add a one-line note to
   `docs/pharosville/CONTRACTS.md` naming them as deliberately dropped so future UI work doesn't read them.
6. **`check-asset-delivery.mjs` is a manual release step only** — it is the only check that proves the
   `.br` `Content-Encoding` transport, `immutable` caching and no-JS-inflation on a real Pages origin
   (`docs/pharosville/OPERATIONS.md:110-111`). Given B-class transport risk lives exactly here, wire it
   into the deploy workflow after the Pages preview deploy (or the release checklist with a SKIP/PASS
   record per operator decision 8).
7. **`initLater` visibility restore skipped on throw** — folded into M1; listed separately so the
   `root.visible = visible` restore moves to a `finally` even if the retry decision differs.
8. **`sim/system.ts` worker-failure playback**: worker loss *after* a successful install freezes the
   fleet at the last installed payloads with honest aging (good), and frozen payloads keep `planKey`
   stable so no retry loop exists — but if `planKey` ever gains a time input, `prepare()` would retry
   `warm.prepare` every tick with no backoff. Worth a one-line assertion in
   `sim/plan-paths.test.ts`/`model/build.test.ts` that `planKey` is time-independent.

## Verified exact / correct (spot-checked against main, not assumed)

- **Sky GLSL**: the `e < 0.0` early return hoists an identical `hazeC` and only skips computation the
  old code overwrote; the hill `e > hmax + pxDeg` skip is sound because `cov = 1 - smoothstep(-pxDeg,
  pxDeg, e - H)` is exactly 0 for `e > H + pxDeg` and `H ≤ hmax` (`sky/sky-glsl.ts:113-115, 217-224`).
- **Sky reflection band dirty-cache** (`sky/sky-system.ts` `renderBand`): every uniform the
  `SKY_REFLECTION` path can read is tracked (I walked the GLSL guard-by-guard: stars/discs/cirrus/
  banks are `#ifndef`'d out; storm deck gates `uWeather.z` behind `uStorm/nightDeck` conservatively
  below the GLSL branch thresholds; `uTime` is read only inside the precip branch gated by the same
  `rain` flag; `uSkyNoise` is tracked by texture version; camera/geometry changes set `bandDirty`).
- **Fog hoist** (`readings/fog.ts`): `uCameraDensity` is the same `exp(-max(y,0)/16)` the shader
  computed per-pixel from `uCamWorld`'s translation (`elements[13]`), uploaded once per pass.
- **Wake decay no-clear** (`ocean/wake.ts`): the fullscreen triangle overwrites every texel with no
  discard/blending; clearing was redundant.
- **Beam back-foot removal**: `uBeamBack` was hard-set to `0` on main; the `k=1` loop iteration
  multiplied by it. Removed from uniforms, GLSL and system with no stragglers (grep clean).
- **Sea NSD1 orientation**: `decodeSdfBytes` writes source row `y` to target row `h-1-y`, which is the
  same minZ-first flip main's WebP canvas path performs (`px.subarray((h-1-j)*row, ...)` → row `j`),
  and `build-sim-seeds.mjs:27` hashes the same flipped bytes. Dev (WebP) and prod (NSD1) agree.
- **Bloom levels mirror** (`engine/post.ts` `setBloomLevels`): matches the pinned postprocessing
  `MipmapBlurPass` levels setter (down/ups target rebuild, `renderTarget` reused as `Upsampling.0`,
  `setSize` after) minus `dispose()`, which is what evicted the still-live materials (RR-01). The
  `levels` getter is array-backed, so no private field diverges.
- **Emblem logo ImageBitmap**: three r186 skips `UNPACK_FLIP_Y_WEBGL`/`UNPACK_PREMULTIPLY_ALPHA_WEBGL`
  for `ImageBitmap` uploads (`WebGLTextures.js` `isImageBitmap === false` guard), so baking
  `imageOrientation: "flipY"` + `premultiplyAlpha: "premultiply"` into the bitmap is the correct way to
  reproduce the old canvas-texel order; the dynamic/logo grid math matches tile-for-tile.
- **`_headers` `:hash` placeholders**: wrangler's bundled pages-shared matcher converts `:name`
  segments to `(?<name>[^/]+)` (`generateRuleRegExp`), so the `.glb.br`/`.pack.br`/`.bin.br`
  `Content-Encoding` rules match in preview and production Pages.
- **Retention**: `retain-assets.mjs` validates every previous entry (path shape, hash-prefixed dir,
  sha256+size, encoding) and re-fetches raw bytes with hash verification; imports exactly one previous
  generation (current + previous = last two releases, per operator decision 2).
- **API/security**: `PHAROS_API_KEY` stays server-side only (`functions/api/[[path]].ts`
  `fetchUpstream`); base URL is pinned to `https://api.pharos.watch` (`normalizeBaseUrl`); the endpoint
  allowlist matches path+search exactly; local vite proxy and checkout-identity never leak env values
  (`.env*` paths filtered from `dirtyPaths`). CSP `/*` rule unchanged; workers are same-origin under
  `script-src 'self'`; no new `connect-src` hosts.
- **Desktop gate**: all world/API bytes sit behind inert `data-pv-preload` links activated only in
  `src/main.tsx:45-47` after BOTH shared predicates pass in JS (no CSS-media-only leak under zoom);
  poster is removed with `"now"` for denied viewports and restored per admission by
  `app/poster.ts` (REVIEW-LOAD-06 path covered by `poster.test.ts`).
- **Feed races**: `HarbourFeed.refresh` now carries a per-endpoint request generation + abort-owner
  check (`data/fetch.ts:147-160`), so a late response can no longer overwrite a newer snapshot
  (REVIEW-LOAD-05); covered by `sim/feed-precedence.test.ts`.
- **Ground target ownership (NFS-004)**: `GroundService.dispose()` exists; `IslandSystem.dispose`
  releases it; engine disposes systems in reverse registration order so LightsSystem's pillar sampler
  is gone first; lights' dispose explicitly drops its `ground` reference.
- **Governor/post (Lane C shape)**: resolution-only rung changes commit without preparation; tier
  changes prepare one adjacent state via an abortable controller while the current tier keeps drawing
  (`end()` returns early while `pending`); GPU queries are a 4-handle ring with disjoint invalidation,
  completed-sample ring and p10/p50 population (NFS-105 shape); `EXT_disjoint_timer_query` is disabled
  under `?prof=gpu` (no nested TIME_ELAPSED).
- **Asset packs**: `readAssetPack` validates magic/size/directory/entry bounds/duplicates before
  exposing entries; packs are dropped from memory once every entry is parsed; JSON fetches are deduped
  per engine (`assets.json`) across civic/kit/crests/prefetch (NFS-026).
- **Reveal ordering** (modulo M3's naming): `DataSystem.prepare()` publishes model + `readiness`
  atomically after `sim.setModel` + `poseAt`, in a task; no animation-frame install path exists
  (`// Installation deliberately has no animation-frame entry point`).

## Process / release-gate reminders (not code defects)

- NFS-055 (2000 ms pending hold, `app/harbour-app.tsx:16`) and NFS-036 (lazy life/identity via
  `life/identity/lazy-system.ts`) are W3-approved **trials**: they may only ship after the operator
  accepts the before/after stills + arrival filmstrips (PLAN.md §6). I found no record of that
  acceptance in the repo; `app/README.md` itself says unit tests do not establish it.
- The integrated gate items (quiet load A/B incl. M2's priority question, transition maxima with/without
  KHR, live-CDN transport + rollback retention exercise, budget re-tightening) are still open by
  design at this phase; `perf:bytes` is wired into `validate` already.

## Test quality (summary)

New tests are behavioural and mostly assert observable contracts rather than implementation details:
`fleet/reconcile.test.ts` (instance/slot/paint/motion-history retention across refreshes, raft-slot
identity), `fleet/uploads.test.ts` (dirty-row ranges incl. pending-before-render and regrow),
`sim/feed-precedence.test.ts`, `sim/seeds.test.ts` (hash mismatch paths), `engine/prepare.test.ts`,
`engine/governor.test.ts`, `app/{admission,poster,reveal,lazy-systems}.test.ts`,
`ui/measurements.test.ts`, `functions/api/proxy.test.ts` (projection/validators/stale). Weak spots:
`reconcile.test.ts` reaches deep into privates via harness interfaces (will break on refactors —
acceptable if intentional), and no test covers B1's worker-failure boot path or M1's
material-dispose-during-deferred-init path — both were found precisely in those gaps.

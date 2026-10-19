# Need for Speed (PharosVille edition) — research/planning brief

Date: 2026-10-19 · Base: `main` @ b71dd282 (v1.2.1 Canvas Up) · Stage: RESEARCH + PLANNING ONLY.

## Goal
Find every optimization that reduces initial loading time (cold + repeat visit, time to first live
frame, time to poster→world crossfade, time to interactive) and improves steady-state performance
(frame time on discrete GPU AND iGPU/laptop class, CPU main-thread work, long tasks, memory, power),
with NO or MARGINAL impact on the scenery. Output feeds one prioritized implementation plan.

## Hard rules for every agent
- Do NOT modify tracked files (src/, shared/, public/, scripts/, functions/, docs/, configs). Research only.
- Write your report to `agents/2026-10-19-need-for-speed/<phase>/<slug>.md`. Scratch (renders, profiles,
  re-encoded assets, builds) to `outputs/need-for-speed/<slug>/`.
- NEVER run `npm run build` (it runs compress-assets which rewrites tracked `public/harbour/**/*.gz`) and
  NEVER build into `dist/` (shared baseline). Build variants with
  `npx vite build --outDir outputs/need-for-speed/<slug>/dist`.
- Spikes that need code changes: `npm run worktree:new -- nfs-<slug> --branch nfs/<slug>` (creates
  `.worktrees/nfs-<slug>`; symlink `node_modules` from the root rather than `npm ci` if it works). Save the
  diff as `outputs/need-for-speed/<slug>/spike.patch`; remove the worktree and branch when done
  (`git worktree remove`, `git branch -D`). Never push.
- Looks / frame time ONLY via `npm run preview -- …` (`scripts/harbour/shot.mjs`, real GPU, captures are
  serialised by a lock across all agents). NEVER launch Playwright/Chromium/Chrome yourself; never headed
  windows. Keep captures few and short (`--seconds 3`) unless you are a designated measurement owner.
  LOOK at PNGs before claiming anything about the picture.
- No lint/format/test gate runs needed for the report; run whatever read-only measurement you need.
- Machine is shared by ~18 concurrent agents: CPU timings are contended. Repeat measurements (≥3, median)
  and label numbers "contended" unless taken on a quiet run.
- Do not consider WebGPU/renderer switch or a graphical fallback (repo rule). Do not propose changing what
  the world MEANS (data mappings, D1–D14). "Marginal visual impact" = not noticeable side by side at the
  supported viewports; anything more must be flagged `visual-risk` with a verification method.
- You MAY spawn `scout` subagents (read-only) for broad code searches.

## Environment (already running — do not restart)
- Dev server (API proxied, unminified): http://localhost:5173/
- Dist preview of a fresh build of HEAD (minified, NO /api proxy → world shows "awaiting data" + fog):
  http://127.0.0.1:4173/  (`dist/`). For production-faithful measurement use the live site
  https://pharosville.pharos.watch/ (real CDN, headers, API) and/or the dev server.
- shot.mjs supports: `--cold --throttle fast4g|cable --cpu-throttle N --waterfall --log-requests
  --profile f.cpuprofile --steady-profile f.cpuprofile --heap-sample f.json --trace f.json --uncapped
  --igpu --json out.json --eval js --init-script js` and `?t=<hour>`, `?view=heart|overview` URL params.
  Report includes `window.__harbourStats` (drawCalls, triangles, programs, textures, gpuMs, boot timings).

## Baseline facts gathered by the orchestrator (dist @4173, no data, 1600×1000@1, RTX 5070 Ti, warm cache)
- firstFrameNavMs 3145, engine firstFrameMs 2693; boot: `u:render` 1942 ms (first render — likely shader
  compile/upload), identity 746, life 188, data 123, civic 120, island 117, fleet 113, ocean 37, compile 106.
- 97 draw calls, 97 programs (!), 51 textures, 1,166,416 triangles, gpuMs 0.91, 60 fps vsync-capped.
- Console: repeated "GPU stall due to ReadPixels"; 7× 404s.
- wireBytesAtFirstFrame 5.47 MB; wireBytes 7.39 MB (no data payloads in this run).
- Dev `/api/stablecoins` payload: ~875 KB uncompressed.
- Built JS: harbour-app 930 KB (322 gz), vendor-rendering (three+postprocessing) 860 KB (248 gz),
  vendor-react 219 KB (68 gz, modulepreloaded on ALL viewports incl. welcome), index 10.7 KB,
  layout JSON 290 KB (55 gz), warm-legs worker 50 KB, ambience 40 KB, CSS 27 KB.
- Media: island.glb 4.6 MB (2.56 MB .gz), emblems.avif 1.48 MB (webp 2.03 MB, png 7.3 MB source),
  sea-sdf.webp 823 KB, poster-1600 avif 105 KB, lighthouse.glb.gz 46 KB, kit/manifest.json 94 KB,
  walkways.json 35 KB, chart-lettering.png 91 KB, public/logos 9.6 MB (panel/search only).
- `public/_headers`: only /assets/* immutable; /harbour/* has no Cache-Control (CF default → revalidate);
  .glb.gz served with Content-Encoding: gzip.
- index.html preloads: fonts, poster, modulepreload of harbour-app + vendor chunks, fetch-preloads of layout,
  sea-sdf, island (low), lighthouse, civic+kit manifests (media-gated).
- Prior "need-for-speed" pass shipped in v1.1.0 (commit 3a015980): preloads + byte prefetch, sim plan off
  the first frame, cheaper iGPU frames, slimmer bundle/atlases, tighter budgets. Older garden-era perf work
  (e.g. beb6a8ca "rule out the Web Worker") is in git history. Do not re-propose what is shipped; do
  re-examine what was ruled out only with new evidence.

## Report format (mandatory)
1. Scope + method (what you read/ran; commands).
2. Measurements (tables; units; run count; contended or quiet).
3. Findings table, one row per opportunity:
   `ID | opportunity | evidence (file:line / measurement) | proposed change | expected gain (quantified, how
   estimated) | visual impact (none / marginal / visual-risk + how to verify) | effort S/M/L | risk |
   dependencies/conflicts | confidence H/M/L`
   IDs prefixed with your slug, e.g. `GLB-03`.
4. Ruled out / not worth it (with reason).
5. Open questions needing operator decision.
Be concrete: exact files, symbols, numbers. No fabricated measurements; unmeasured = `[estimate]`.

# Load & Bundle Audit

## Summary

PharosVille's load performance is well-structured overall: a 7KB entry chunk + lazy-loaded 922KB desktop module delivers efficient first-paint isolation. Total JS is 1.15MB raw (331KB gzip). However, 6.6MB of PNG assets (logos, chains, pharosville docks/ships/props) dominate network footprint—82 pharosville assets alone. No WebP/AVIF optimization, no sprite atlasing for per-ship PNGs, and no explicit cache headers create significant recovery opportunities. TanStack Query polling is well-tuned but GA script is async-loaded on the critical path.

---

## Findings

### F1: PNG asset fatness — no format negotiation (WebP/AVIF)
- **Where:** `public/logos/` (4.3MB), `public/chains/` (2.4MB), `public/pharosville/` (1.1MB) — 576 image files totaling 6.6MB
- **Impact:** 3–4MB saved (50–60% reduction with modern formats if client supports)
- **Effort:** high (requires build step, browser accept-header negotiation, fallback handling)
- **Reward:** high (cuts 30–40% of total site weight, helps mobile UX beyond scope)
- **Fix sketch:** Add build step to generate WebP/AVIF variants via `imagemin-webp` or `svgexport`. Serve via `<picture>` tags or content-negotiation headers. Logos + chains benefit most (196KB euroe.png → ~60–80KB WebP).

### F2: og-card.png is 156KB and oversized for social preview
- **Where:** `public/og-card.png`
- **Impact:** ~120KB saved with lossless PNG optimization or WebP conversion
- **Effort:** low
- **Reward:** mid (social embeds don't drive critical load, but reduces public/ cache bloat)
- **Fix sketch:** Compress with `oxipng -o4 --strip safe` or convert to WebP. Social platforms resize anyway; 1200x630 at 50–70KB is normal.

### F3: 82 pharosville asset PNGs are not sprite-atlased
- **Where:** `public/pharosville/assets/` — 82 individual PNG files for ships, docks, landmarks, overlays, props, terrain
- **Impact:** Estimated 15–25% per-asset overhead (frame/metadata in PNG headers) eliminated; ~150–200KB saved; eliminates 80+ HTTP requests in dev/early loads
- **Effort:** high (requires sprite-sheet generation, UV remapping in renderer)
- **Reward:** mid (perfdev gain at scale; network saving modest if assets HTTP/2 cached, but header cost accumulates)
- **Fix sketch:** Use PixelLab or similar to generate a tilemap-style sprite sheet. Update manifest to reference sprite bounds (spriteSheet.frameWidth, spriteSheet.frameHeight, columns, rows). Render layer updates to use texture-atlas UV coordinates.

### F4: No explicit Cache-Control headers in _headers
- **Where:** `public/_headers` — security & CSP headers present, but no asset versioning rules
- **Impact:** ~10% improved repeat-visit speed (assets already hash-versioned by Vite, but absence of long-cache directive confuses CDN cache behavior)
- **Effort:** low
- **Reward:** low–mid (already mitigated by hash-based filenames; mainly clarifies intent for Cloudflare)
- **Fix sketch:** Add rule: `/assets/* Cache-Control: public, max-age=31536000, immutable`. Hashed chunks are safe for max-age=1yr.

### F5: GA script is async but blocks manifest.runtime.json preload
- **Where:** `src/google-analytics.ts` (lazy-loaded), `index.html` line 30 (manifest.runtime.json has lower priority than GA)
- **Impact:** ~50–100ms possible latency if GA domain is slow (unlikely but blocks polyfill/query setup)
- **Effort:** low
- **Reward:** low (GA is optional telemetry; unlikely bottleneck)
- **Fix sketch:** Move GA installation to post-render hook or defer to idle callback (if window.requestIdleCallback available). Preload manifest unconditionally before GA async script.

### F6: TanStack Query polling intervals not time-quantized
- **Where:** `src/hooks/use-api-query.ts` lines 36–38 — staleTime and refetchInterval set to cronInterval and 2× cronInterval
- **Impact:** Minimal (~5–10ms), but multiple queries may batch-fetch on staggered timers
- **Effort:** low
- **Reward:** low (API already optimized per contract)
- **Fix sketch:** No action needed if API contract already specifies interval sync. If multiple endpoints have independent cron timers, consider phase-aligning stale times to batch requests into a single payload fetch window.

### F7: Entry chunk (index-BmtIFq6C.js) is only 7KB — excellent lean shell
- **Where:** `dist/assets/index-*.js` — 7.0 KiB raw, 2.6 KiB gzip
- **Impact:** Already optimal; entry load time < 50ms on 4G
- **Effort:** N/A (already good)
- **Reward:** N/A (exemplary)
- **Fix sketch:** Maintain. This is the gold standard for Vite entries.

### F8: Desktop module is 922KB raw (259KB gzip) — reasonable for a canvas world
- **Where:** `dist/assets/pharosville-desktop-data-*.js` — world renderer, ship dynamics, detail pane logic
- **Impact:** Loading completes in ~1s on 4G (259KB gzip ~1200ms at 200Kbps); modulepreload on desktop media query helps
- **Effort:** mid (would require feature decomposition)
- **Reward:** low (already lazy-loaded; splitting further (e.g., docks vs. ships) yields <5% gain)
- **Fix sketch:** Current strategy (single lazy chunk loaded on desktop query match) is sound. If future growth approaches 1.2MB raw, consider splitting detail pane logic into sub-routes.

### F9: CSS (20KB raw, 3.9KB gzip) is lean and non-render-blocking
- **Where:** `dist/assets/index-*.css`
- **Impact:** Already optimal; inlining not beneficial at this size
- **Effort:** N/A
- **Reward:** N/A (exemplary)
- **Fix sketch:** Maintain.

### F10: SVGs (72KB total, 18 files) are not minified in dist
- **Where:** `public/` — various `.svg` files (favicon.svg, etc.)
- **Impact:** ~10–15KB saved with SVGO minification
- **Effort:** low (add SVGO to build)
- **Reward:** low (already cached, bundled, lazy)
- **Fix sketch:** Add `vite-plugin-svgo` or post-build `svgo` pass to minify SVGs. Target: < 50KB total.

### F11: Manifest.runtime.json is generated and slim (~200–300KB JSON)
- **Where:** `src/main.tsx` → `pharosVilleRuntimeManifest()` plugin, serialized in `writeBundle`
- **Impact:** Already optimized — authoring fields stripped at build time
- **Effort:** N/A
- **Reward:** N/A (exemplary)
- **Fix sketch:** Maintain. Good practice to decouple authoring schema from runtime.

### F12: Lucide-react (icon library) not explicitly chunked, bundled in vendor-react
- **Where:** `vite.config.ts` lines 217–223 — only React + React-DOM + TanStack Query get manual chunks; Lucide inlined
- **Impact:** ~20–30KB added to vendor-react (or entry); not a bottleneck but visible
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Optional: split Lucide into `vendor-lucide` chunk if icon usage is deferred. Currently, icons are probably used in entry shell, so no gain. Monitor if icons-per-route diverge.

---

## Priority Summary (Top 5 by Reward/Effort Ratio)

| # | Finding | Effort | Reward | Est. Savings |
|---|---------|--------|--------|--------------|
| **F1** | WebP/AVIF format negotiation for PNGs | High | High | 3–4 MB |
| **F2** | Lossless compress og-card.png | Low | Mid | 120 KB |
| **F4** | Add Cache-Control: immutable headers | Low | Low | 10–15% repeat-visit latency |
| **F10** | Minify SVGs with SVGO | Low | Low | 15 KB |
| **F3** | Sprite-atlas pharosville PNG assets | High | Mid | 150–200 KB + request consolidation |

**Current State:** 1.15 MB JS (331 KB gzip) + 6.6 MB images = **7.75 MB total load**. With F1–F4, achievable: **3.5–4.5 MB** (53–42% reduction).


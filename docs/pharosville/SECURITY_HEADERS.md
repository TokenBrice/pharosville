# PharosVille Security Headers Policy

Last updated: 2026-09-27

## Scope

This policy covers:

- Browser and static routes served from `pharosville.pharos.watch`
- Pages Function API responses under `/api/*`
- Client error log responses under `/_log`

## Required response headers

The following headers are required for production responses:

### Static routes

- `strict-transport-security: max-age=31536000; includeSubDomains; preload`
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: strict-origin-when-cross-origin`
- `permissions-policy: accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), clipboard-read=(), display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(self), serial=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()`
- `cross-origin-opener-policy: same-origin`
- `cross-origin-resource-policy: same-origin`
- `content-security-policy: default-src 'self'; base-uri 'self'; object-src 'none'; img-src 'self' data: blob: https://www.google-analytics.com; style-src 'self'; script-src 'self' 'sha256-N6xBytS8x26THx7R/YopztpleQZ27s6FgHqFtIHRM3c=' 'wasm-unsafe-eval' https://www.googletagmanager.com https://static.cloudflareinsights.com; connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://static.cloudflareinsights.com; frame-ancestors 'none'; form-action 'self'`

`img-src blob:` and `script-src 'wasm-unsafe-eval'` are required by the world, not optional slack. SVG fleet logos are decoded through `URL.createObjectURL`, and every runtime GLB (the lighthouse shell and the eight named-titan hulls) is meshopt-compressed, so the decoder must instantiate WebAssembly. Without them the deployed site silently renders the procedural fallback lighthouse, fallback hulls and blank sails while the dev server — which sends no CSP — looks correct. `'wasm-unsafe-eval'` permits only WebAssembly compilation; JavaScript `eval` stays blocked. The static validator requires both sources.

The one `'sha256-…'` source is the clock-selected gradient script in `index.html`: it runs before modules and writes only the root's `data-pv-veil-beat` attribute. `public/arrival-shell.css` owns all gradient colours and shell layout; the shell uses no inline style block, style attribute or event handler, and needs no `unsafe-inline`. Identity, the generic encoding guide, honest module-wait stage and analytics links remain useful with no JavaScript or a failed entry module. Any script-byte edit changes its exact hash; `src/systems/garden-arrival.test.ts` pins parity with `public/_headers` and rejects inline styles/handlers.

Every Permissions-Policy feature is denied with `()` except two, which are same-origin only with `(self)`: `fullscreen` and `screen-wake-lock`. Stay mode (W6.9, `src/hooks/use-stay-mode.ts`) takes the window fullscreen and keeps the screen awake while the harbour is left open. Under `()` the deployed site refused both requests; the dev server sends no headers, so Stay only worked locally. No other origin may use either feature. The static validator (`SELF_ONLY_PERMISSIONS_POLICY_FEATURES` in `scripts/pharosville/check-security-headers.mjs`) requires `(self)` for these two and `()` for everything else. The JSON API and `/_log` responses (`functions/_shared.ts`) serve no document and keep denying all features.

Opt-in sound adds no header source. Its `AudioContext` is created inside the Sound switch's own click (user activation), and its lazy procedural chunk is same-origin script. Verify sound on the deployed site after any `autoplay` policy change; that path has not been measured under production headers.

The optional `VITE_GA_ID` flow still requires `www.googletagmanager.com` for the loader and exact Google Analytics hosts for beacon traffic, but the static policy should not use `*.google-analytics.com`, `*.analytics.google.com`, or `*.googletagmanager.com` wildcards while analytics is inactive by default. Cloudflare Pages `_headers` is a static file, so the pragmatic closure for repo-review item #35 is to keep analytics runtime-gated by `VITE_GA_ID`, allow only the exact hosts required by that optional path, and reject wildcard CSP sources in static validation.

### API responses (`/api/*`)

- Use the API CSP from `functions/api/[[path]].ts`: `default-src 'self'; base-uri 'self'; object-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' https://api.pharos.watch; frame-ancestors 'none'; form-action 'self'`.
- Add `x-pharosville-proxy: 1`.
- Forward only the allowlisted upstream response headers: `cache-control`, `content-type`, `etag`, `retry-after`, `warning`, and `x-data-age`.
- Keep `content-type` as JSON for allowlisted endpoints.

### Client error log (`/_log`)

- Accepts same-origin `POST` only.
- Requires JSON, max body `4 KiB`, and rate-limits by client IP hash with a 10-second edge-cache window.
- Projects and truncates known fields before logging; it does not echo payloads.
- Uses `cache-control: no-store` and CSP `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`.

## Implementation locations

- Browser/static header policy: [public/_headers](../../public/_headers)
- API response hardening: `functions/api/[[path]].ts`
- Client error log hardening: `functions/_log.ts`
- Live verification command: `npm run check:security-headers`
- Static pre-deploy parser: `npm run check:security-headers:static`
- Live verification with endpoint payload guards: `npm run smoke:live -- --url https://pharosville.pharos.watch`

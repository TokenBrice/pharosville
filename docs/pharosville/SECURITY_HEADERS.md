# PharosVille Security Headers Policy

Last updated: 2026-06-14

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
- `permissions-policy: accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), clipboard-read=(), display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()`
- `cross-origin-opener-policy: same-origin`
- `cross-origin-resource-policy: same-origin`
- `content-security-policy: default-src 'self'; base-uri 'self'; object-src 'none'; img-src 'self' data: https://www.google-analytics.com; style-src 'self'; script-src 'self' https://www.googletagmanager.com https://static.cloudflareinsights.com; connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://static.cloudflareinsights.com; frame-ancestors 'none'; form-action 'self'`

The optional `VITE_GA_ID` flow still requires `www.googletagmanager.com` for the loader and exact Google Analytics hosts for beacon traffic, but the static policy should not use `*.google-analytics.com`, `*.analytics.google.com`, or `*.googletagmanager.com` wildcards while analytics is inactive by default.

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

- Browser/static header policy: [public/_headers](/home/ahirice/Documents/git/pharosville/public/_headers)
- API response hardening: [functions/api/[[path]].ts](/home/ahirice/Documents/git/pharosville/functions/api/[[path]].ts)
- Client error log hardening: [client error log function](/home/ahirice/Documents/git/pharosville/functions/_log.ts)
- Live verification command: `npm run check:security-headers`
- Static pre-deploy parser: `npm run check:security-headers:static`
- Live verification with endpoint payload guards: `npm run smoke:live -- --url https://pharosville.pharos.watch`

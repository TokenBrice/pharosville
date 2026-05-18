# PharosVille Security Headers Policy

Last updated: 2026-05-18

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
- `permissions-policy: accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()`
- `cross-origin-opener-policy: same-origin`
- `cross-origin-resource-policy: same-origin`
- `content-security-policy: default-src 'self'; base-uri 'self'; object-src 'none'; img-src 'self' data: https://*.google-analytics.com; style-src 'self'; script-src 'self' https://www.googletagmanager.com https://static.cloudflareinsights.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://static.cloudflareinsights.com; frame-ancestors 'none'; form-action 'self'`

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
- Verification command: `npm run check:security-headers`
- Live verification with endpoint payload guards: `npm run smoke:live -- --url https://pharosville.pharos.watch`

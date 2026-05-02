# PharosVille Security Headers Policy

Last updated: 2026-05-02

## Scope

This policy covers:

- Browser and static routes served from `pharosville.pharos.watch`
- Pages Function API responses under `/api/*`

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
- `content-security-policy: default-src 'self'; base-uri 'self'; object-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'`

### API responses (`/api/*`)

- Inherit all static route headers where applicable.
- Add `x-pharosville-proxy: 1`.
- Preserve upstream cache headers (`cache-control`, `content-type`, `etag`, etc.) where present.
- Keep `content-type` as JSON for allowlisted endpoints.

## Implementation locations

- Browser/static header policy: [public/_headers](/home/ahirice/Documents/git/pharosville/public/_headers)
- API response hardening: [functions/api/[[path]].ts](/home/ahirice/Documents/git/pharosville/functions/api/[[path]].ts)
- Verification command: `npm run check:security-headers`
- Live verification with endpoint payload guards: `npm run smoke:live -- --url https://pharosville.pharos.watch`

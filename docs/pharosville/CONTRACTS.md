# PharosVille Runtime and Analytical Contracts

Last updated: 2026-10-14

This file owns runtime, truth, access and resource limits for The Harbour.
World meaning and art direction are the locked decisions D1-D14 in
`agents/2026-10-13-pharosville-reboot/PLAN.md` (circuits D10, minimal UI D11,
chart voice D12). The Garden Observatory contracts were retired with that world
at the Harbour cutover (2026-10-14) and remain in git history. Change a
contract only with explicit intent and matching code, tests and route docs.

## Runtime, security and access

- One production three.js WebGL2 world (`src/harbour/`). If it cannot start,
  the first-paint poster stays up with the guide and the analytics links;
  never boot another graphical renderer.
- Both the device screen and the current viewport must satisfy the
  sorted-dimension `900×720` or `1200×640` size profile before the Harbour
  chunk, world data, three.js, GLBs or logos load. These are size tests, never
  orientation tests. Blocked devices and small windows receive the welcome page
  with the guide, a static illustration ("Illustration, not live readings")
  and actual Pharos analytics links, and request no world/API/GLB/logo
  resource. Coverage: `src/client.test.tsx`, `npm run check:viewport-gate`.
- First-byte HTML supplies identity, the three-line guide, an honest stage and
  working links over a poster with no live numbers; it crossfades into the
  first live frame. No inline script, so the CSP pins no hash.
- Browser world code calls same-origin `/api/*` only. `PHAROS_API_KEY` remains
  server-side; never expose it through client code, fixtures, docs or logs.
- The endpoint registry (`shared/lib/pharosville-endpoint-registry.ts`) owns
  the seven sources and their cadences. The feed keeps the last good payload
  per endpoint; a failed refresh never blanks the harbour, it lets that payload
  age into stale. Freshness comes from the payload `_meta`, `X-Data-Age`, `Age`
  and `Warning` evidence and the shared freshness ratios; unknown age is never
  assumed current. Coverage: `src/harbour/data/fetch.test.ts`,
  `src/harbour/model/build.test.ts`.
- Truth states are part of the picture: stale data reads as fog, awaiting data
  is an empty harbour (never a fixture fleet), and missing evidence never reads
  as calm.
- Every reading the world encodes is also readable on demand (hover tag, side
  panel, ledger), with its freshness. Colour is never the only carrier of
  meaning; keyboard search, selection and Escape stay useful without
  inspecting WebGL pixels.

## Approval and delivery

The reboot runs on `reboot/harbour` through the gates in the PLAN (§8).
Agents never push, open PRs, tag or release. Releases go through
`RELEASES.md` and the protected workflow; validation routing lives in
`TESTING.md`.

# PharosVille Docs

This docs index is for public readers, contributors, and agents arriving from GitHub.

## Start Here

- [App contract](./pharosville-page.md) - user-facing behavior for `https://pharosville.pharos.watch/`
- [Architecture](./pharosville/ARCHITECTURE.md) - API proxy, world model, renderer, and asset flow
- [Testing](./pharosville/TESTING.md) - focused checks, visual checks, and release validation
- [Releases](./pharosville/RELEASES.md) - protected release workflow, recovery, historical backfill, and drift audit
- [Operations](./pharosville/OPERATIONS.md) - Cloudflare Pages setup, deploy, live smoke, rollback, and credential rotation
- [Security headers](./pharosville/SECURITY_HEADERS.md) - static and API response header policy
- [The Harbour plan](../agents/2026-10-13-pharosville-reboot/PLAN.md) - locked decisions (circuits, minimal UI, chart voice) for the current world
- [GitHub media](./pharosville/GITHUB_MEDIA.md) - social preview, README image, and screenshot guidance

## Contributor Links

- [Repository README](../README.md)
- [Contributing](../CONTRIBUTING.md)
- [Security policy](../SECURITY.md)
- [Support](../SUPPORT.md)
- [Changelog](../CHANGELOG.md)

## Key Guardrails

- Browser code calls same-origin `/api/*` only.
- `PHAROS_API_KEY` stays server-side in Cloudflare Pages.
- Unsupported viewports must not mount the PharosVille world runtime or fetch world data.
- The production world is The Harbour (`src/harbour/`): one three.js WebGL2
  engine, same-origin identity marks, and checked GLBs and textures under
  `public/harbour/`.
- If WebGL2 cannot start, the first-paint poster stays up with the guide and
  Pharos links; there is no second graphical renderer.

# PharosVille Docs

This docs index is for public readers, contributors, and agents arriving from GitHub.

## Start Here

- [App contract](./pharosville-page.md) - user-facing behavior for `https://pharosville.pharos.watch/`
- [Architecture](./pharosville/ARCHITECTURE.md) - API proxy, world model, renderer, and asset flow
- [Testing](./pharosville/TESTING.md) - focused checks, visual checks, and release validation
- [Operations](./pharosville/OPERATIONS.md) - Cloudflare Pages setup, deploy, live smoke, rollback, and credential rotation
- [Security headers](./pharosville/SECURITY_HEADERS.md) - static and API response header policy
- [Visual invariants](./pharosville/VISUAL_INVARIANTS.md) - non-negotiable visual and data contracts
- [Asset pipeline](./pharosville/ASSET_PIPELINE.md) - local sprite manifest and promotion workflow
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
- Runtime art is local and manifest-backed under `public/pharosville/assets/`.

# PharosVille Docs

This docs index is for public readers, contributors, and agents arriving from GitHub.

## Start Here

- [App contract](./pharosville-page.md) - user-facing behavior for `https://pharosville.pharos.watch/`
- [Architecture](./pharosville/ARCHITECTURE.md) - API proxy, world model, renderer, and asset flow
- [Testing](./pharosville/TESTING.md) - focused checks, visual checks, and release validation
- [Releases](./pharosville/RELEASES.md) - protected release workflow, recovery, historical backfill, and drift audit
- [Operations](./pharosville/OPERATIONS.md) - Cloudflare Pages setup, deploy, live smoke, rollback, and credential rotation
- [Security headers](./pharosville/SECURITY_HEADERS.md) - static and API response header policy
- [Visual and analytical contracts](./pharosville/VISUAL_INVARIANTS.md) - non-negotiable world meaning, composition, and motion
- [Three.js runtime guide](./pharosville/THREEJS_AGENT_REFERENCE.md) - module ownership, frame contract, disposal, and change recipes
- [Runtime media](./pharosville/ASSET_PIPELINE.md) - logo, atlas, model, and texture workflow
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
- The production world uses procedural Three.js content, same-origin identity
  marks, and checked lighthouse and hero-hull GLBs under
  `public/pharosville/models/`.
- Renderer or GPU failure presents the DOM signal overview; there is no second
  graphical renderer.

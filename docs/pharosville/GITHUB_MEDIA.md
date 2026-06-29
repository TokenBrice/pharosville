# PharosVille GitHub Media

Last updated: 2026-06-29

Use this file to keep GitHub, README, and social-preview media consistent.

## Current Assets

- OG card: `public/og-card.png`
- README brand preview: `public/og-card.png`
- README product screenshot: `docs/pharosville/media/pharosville-desktop-shell.png`
- Canonical app URL: `https://pharosville.pharos.watch/`
- Repository URL: `https://github.com/TokenBrice/pharosville`

## Repository Social Preview

Use `public/og-card.png` as the GitHub repository social preview. It is 1200x630 and already referenced by `index.html` Open Graph and Twitter metadata.

GitHub repository social previews are configured in the repository web UI:

1. Open repository Settings.
2. Open Social preview.
3. Upload `public/og-card.png`.
4. Save the change.

There is no stable public REST API for setting the repository social preview.

## README Product Screenshot

The product screenshot should show the actual desktop shell, not only a branded card. Regenerate from a known visual snapshot or a fresh local capture, then downscale for GitHub readability:

```bash
mkdir -p docs/pharosville/media
magick tests/visual/pharosville.spec.ts-snapshots/pharosville-desktop-shell-desktop-chromium-linux.png \
  -resize 960x \
  -strip \
  docs/pharosville/media/pharosville-desktop-shell.png
```

Use `outputs/` for scratch captures before promoting anything into docs.

## Provenance Rules

- Do not commit `test-results/`, `playwright-report/`, `dist/`, local env files, or scratch captures.
- Do not use generated remote URLs at runtime.
- Do not bake token names, chain names, or analytical labels into runtime sprite art.
- Prefer small, inspectable PNG/WebP assets for GitHub media.

## Validation

For media-only documentation changes:

```bash
npm run validate:docs
```

For app-shell or metadata changes:

```bash
npm run validate:changed
```

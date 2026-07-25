# PharosVille GitHub Media

Last updated: 2026-07-25

Use this file to keep GitHub, README, and social-preview media consistent.

## Current Assets

- OG card: `public/og-card.png`
- README brand preview: `public/og-card.png`
- README product screenshot: `docs/pharosville/media/pharosville-desktop-shell.png` (1200px-wide Garden Observatory view)
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

The product screenshot is the current Three.js day overview captured at
`1440x960`, with the full Garden Observatory, ships, analytical zones, and
shell controls visible. Promote the current visual-audit capture with:

```bash
magick outputs/visual-audit/day.png \
  -resize 1200x \
  -strip \
  docs/pharosville/media/pharosville-desktop-shell.png
```

Use `outputs/` for scratch captures before promoting anything into docs.

## Provenance Rules

- Do not commit `test-results/`, `playwright-report/`, `dist/`, local env files, or scratch captures.
- Do not use generated remote URLs at runtime.
- Do not bake token names, chain names, or analytical labels into promotional
  world art.
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

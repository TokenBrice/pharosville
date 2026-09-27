# PharosVille GitHub Media

Last updated: 2026-09-27

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

`docs/pharosville/media/pharosville-desktop-shell.png` predates the Hour-Print
look (the old landing camera and chrome). Recapture it from the rest seat on the
real GPU before the Hour-Print release, never from a Playwright browser, which
renders through SwiftShader (`TESTING.md`):

```bash
npm run preview -- --clock 2026-09-26 --hash "#t=12.25" --still-camera --seconds 14 \
  --width 1440 --height 960 --out media/day.png
magick outputs/media/day.png -resize 1200x -strip \
  docs/pharosville/media/pharosville-desktop-shell.png
```

Keep the world chrome in the shot; it is a product screenshot. Use `outputs/`
for scratch captures before promoting anything into docs.

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

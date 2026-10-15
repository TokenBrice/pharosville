# PharosVille GitHub Media

Last updated: 2026-10-15

Use this file to keep GitHub, README, and social-preview media consistent.

## Current Assets

- OG card / README brand preview: `public/og-card.png` (1200×630), cropped from the Harbour key art (golden hour, the default heart framing). No text and no live numbers.
- First-paint poster and small-screen illustration: `public/harbour/poster-{960,1600}.{avif,webp}`, from the same key art.
- README product screenshot: `docs/pharosville/media/pharosville-desktop-shell.png` (1200px-wide Harbour view)
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

Capture it on the real GPU, never from a Playwright browser (`TESTING.md`):

```bash
npm run preview -- --url "http://localhost:5173/?t=18.5" --out outputs/media/harbour.png
magick outputs/media/harbour.png -resize 1200x -strip \
  docs/pharosville/media/pharosville-desktop-shell.png
```

Keep the corner mark in the shot; it is a product screenshot. Use `outputs/`
for scratch captures before promoting anything into docs.

## Provenance Rules

The key art is a real-GPU runtime capture of the classical harbour
(`agents/2026-10-15-classical-town/p8/key-heart-golden.jpg`: `shot.mjs` on the
heart view, `?t=18.5&season=summer&dews=CALM`, with the DOM overlay hidden so
only the canvas shows). The poster and the OG card are offline crops and
encodes of it (ImageMagick, cwebp, avifenc, pngquant); never bake numerical
readings, token names or chain
names into promotional art, and keep the alt text saying "Illustration, not
live readings".

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

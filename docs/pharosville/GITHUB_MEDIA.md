# PharosVille GitHub Media

Last updated: 2026-10-05

Use this file to keep GitHub, README, and social-preview media consistent.

## Current Assets

- OG card / README brand preview: `public/og-card.png` (1200×630). Garden Observatory replacement is pending accepted real-GPU inputs; do not present the legacy island-city card as the new garden.
- Small-screen hour illustrations: `public/pharosville/stills/garden-{dawn,day,golden,blue,night}[-portrait].{avif,jpg}`, ≤90,000 bytes each. Only the generated `public/pharosville/stills/garden-social.json` publication elects them; until publication, visitors receive useful text and links without a stale photo.
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

### Garden Observatory publication

`agents/2026-10-05-garden-levers/destination/social-crops.json` is the input
manifest, with exact serial `outputs/cap.sh` invocations, capture JSON paths and
pixel crop rectangles. The orchestrator accepts the integrated art and all ten
five-beat portrait/landscape sources before marking `accepted: true` and running
`node scripts/pharosville/generate-garden-social.mjs`. This is an offline
composition step: installed ImageMagick and repo-local EB Garamond only, no
browser, remote generation or runtime dependency. Encoder versions must match
for byte-identical regeneration.

Publish all twenty still encodings, `public/og-card.png` and the generated
publication JSON in one release. The JSON records source/output hashes, crop
rectangles, exact capture commands and the font hash; the marker is written
last. Capture acceptance is currently pending, not inferred from generated
hashes. Until it exists, the legacy hour assets are not shown. The OG card adds
only “PharosVille”, “A living stablecoin garden” and “Illustration, not live
readings”; it never bakes numerical readings into promotional art. Its matching
OG/Twitter alt describes the garden, Pharos, moss, stone and anchored sails.

Review the accepted card at thumbnail size before uploading it in GitHub
Settings. A missing still never removes the brand, encoding guide or analytics
links; renderer failure still uses the selectable DOM overview.


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

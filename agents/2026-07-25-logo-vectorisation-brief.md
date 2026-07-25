# Task: vector-ise the PharosVille logo inventory

> Brief prepared 2026-07-25 for a GPT-5.6-Terra (xhigh effort) agent.
> Recommended: run **Batch A alone first** as a pilot — 11 files is enough to prove
> the sourcing pipeline and the render harness before spending budget on 254.

You are working in `/home/ahirice/Documents/git/pharosville` (git repo, branch `main`,
clean tree). Read `CLAUDE.md` and `AGENTS.md` first, then run `npm run onboard:agent`.

## Background — why this task exists (already measured, do not re-derive)

PharosVille is a Three.js isometric data-world. Every ship flies an identity sail
carrying its token's logo; every harbour flies a flag carrying its chain's logo.

- The sail paints its logo into a **~100×100 px box** (`IDENTITY_RADIUS` 56 ×
  `IDENTITY_LOGO_SPAN` 1.78 — `src/three/garden-sail-texture.ts:248`).
- The harbour flag paints into an **~89 px box** (`src/three/garden-chain-flag.ts:261`).
- Of the 332 logos referenced by `data/logos.json`: 11 are already SVG, **254 are
  raster ≤64 px** (the majority exactly 50×50), 64 are ≥200 px.
- So ~77% of the fleet is a 50 px image upscaled ~2×. The chain logos are worse:
  `ton.png` is 24×24 and `avalanche/bsc/tron.png` are 28×28, stretched into an
  89 px box — a 3.2× upscale.

An A/B in the live app confirmed the browser rasterises SVG at the `drawImage`
destination size, not at intrinsic size: a `2-usdc.svg` declaring only 16×16 renders
razor-sharp at 100 px, while a 50 px PNG at 100 px is visibly mush.

**Your job is to replace low-resolution raster logos with genuine, self-contained
vector SVGs.** This is an asset + manifest task. It requires no code changes.

## Scope

**Batch A — chain logos (do this first, ship it separately).** All 11 files in
`public/chains/`. Highest upscale ratios, smallest job, visible on every harbour.
Priority order by current size: `ton` (24), `avalanche`/`bsc`/`tron` (28),
`arbitrum`/`base`/`polygon` (64). `ethereum` (192), `hyperliquid-l1` (200),
`aptos` (600) are lower priority; `solana` is already SVG.

> **Batch A has an extra, non-negotiable requirement: chain marks must be
> GLYPH-ONLY on a TRANSPARENT background.**
>
> Harbour flags no longer put the logo on a contrasting disc. As of
> `src/three/garden-chain-flag.ts`, the flag is dyed in the chain's brand colour
> and the mark is **knocked out of it in a single flat ink** — the glyph's own
> alpha channel is the stencil (`source-in`).
>
> This means a logo supplied as a **filled badge** — the glyph sitting on an
> opaque disc or square — has no transparency to stencil against and knocks out
> as a **solid block of ink**, destroying the mark entirely. This is not
> hypothetical: measured on 2026-07-25, 6 of the 11 current chain PNGs are 100%
> opaque and 3 more are opaque circles. Every one of them would fail.
>
> So for each chain, source the **transparent-background symbol/glyph variant**
> (brand kits usually call it "symbol", "icon", "mark", or "monogram" — not
> "logo lockup" and not the badge/app-icon form). Verify with:
>
> ```bash
> magick public/chains/<file> -alpha extract -format "%[fx:mean*100]" info:
> ```
>
> Interpret: this prints the share of the canvas that is opaque. A real glyph
> lands well under ~60%. **100% means fully opaque — reject it.** Multi-colour
> is fine and needs no flattening; the knockout discards colour anyway. What
> matters is only that the silhouette is correct and the background is empty.

**Batch B — fleet token logos.** Build the worklist yourself:

```bash
python3 -c "
import json, subprocess, os
d = json.load(open(LOGOS_JSON))  # data/logos.json
seen = {}
for k, v in d.items():
    ext = os.path.splitext(v)[1].lower()
    if ext == '.svg': continue
    p = 'public' + v
    if not os.path.exists(p): continue
    o = subprocess.run(['magick','identify','-format','%w %h',p],
                       capture_output=True, text=True).stdout.split()
    if max(int(o[0]), int(o[1])) <= 64:
        seen.setdefault(v, []).append(k)
for path, ids in sorted(seen.items()):
    print(f'{path}  ids={\",\".join(ids)}')
"
```

Filenames follow `{id}-{symbol}.{ext}`, so the ticker is in the filename. Note some
paths are shared by several ids — dedupe by path; one swap serves all its ids.

Work Batch B in descending order of how many ships carry the token. If you cannot
finish all 254, that is expected and fine — **partial delivery is explicitly
acceptable.** Prioritise recognisable majors (USDT, USDC, DAI, USDS, GHO, crvUSD,
FRAX, PYUSD, USDe, RLUSD, ...) and report exactly what you left undone.

## Hard rules

- Work only inside `/home/ahirice/Documents/git/pharosville`.
- **Do not modify anything under `src/**`.** If you believe a code change is needed,
  stop and report it instead of making it.
- **Do not touch `dist/`** (generated) or `test-results/`.
- **Do not run `extract-brand-colors.mjs` and do not edit `data/brand-colors.json`
  or `data/brand-color-overrides.json`.** Brand colours are derived from these logo
  files and now dye entire sails, so re-extraction shifts fleet colours and needs a
  deliberate operator visual review. Flag it in your report; do not act on it.
- Out of scope, do not attempt: atlas cell size, texture `anisotropy`, mipmapping,
  or any renderer tuning.
- Assets must be vendored locally and served same-origin. Never introduce a remote
  URL into runtime code or data.
- Leave your work **uncommitted in the working tree**. Do not commit, push, tag, or
  create releases.
- **A second agent is concurrently rewriting the documentation tree.** You will find
  pre-existing uncommitted modifications and deletions under `docs/**`, plus
  `README.md`, `PRODUCT.md`, and `SECURITY.md`. **These are not yours and are
  intentional.** Do not revert, repair, re-create, or comment on them, and do not
  `git checkout`/`git stash` anything to "clean" the tree — you would destroy
  another agent's work. Touch only `public/logos/`, `public/chains/`,
  `data/logos.json`, and `outputs/`.

## Acceptance criteria — every SVG must pass all of these

These are the failure modes that make an SVG swap worthless or actively broken.
Check each one; reject and find another source if any fails.

1. **Not a raster in a vector wrapper.** Many "SVG" downloads from token sites are
   an `<image>` element wrapping a base64 PNG. These give zero benefit. Reject if
   the file contains `<image` or `data:image/`.
2. **Self-contained — no external resources.** The app loads these through
   `new Image()`, and SVG-in-`<img>` is a *sandboxed context*: external fonts, CSS,
   scripts and images silently do not load. Reject if the file contains `<script`,
   `@import`, `href="http`, or `xlink:href="http`.
3. **No live text.** `<text>` depending on a font that will not load renders wrong
   or blank. Text must be converted to paths. Reject if `<text` or `font-family`
   appears.
4. **A `viewBox` is mandatory.** `src/three/garden-sail-texture.ts` computes aspect
   ratio from `naturalWidth`/`naturalHeight` (`containedDimensions`). This was
   measured in Chromium on 2026-07-25: an SVG carrying a `viewBox` but no
   `width`/`height` reports a *default-scaled but aspect-correct* size (a square
   viewBox reports 150×150, a 2:1 viewBox reports 300×150), and since
   `containedDimensions` normalises by the largest edge, **it draws correctly**. An
   SVG with **no `viewBox` at all** reports a flat 300×150 regardless of its art and
   **will be squashed to 2:1**. So: reject any file without a `viewBox`. Adding
   explicit `width`/`height` matching the viewBox is still preferred hygiene, but it
   is not a rejection reason on its own.
5. **Visually the same mark** as the raster it replaces — same glyph, same brand
   colours, roughly the same crop/padding. A different-era or different-variant logo
   is a regression, not an upgrade.

A quick triage pass for 1–3:

```bash
grep -lE '<image|data:image/|<script|@import|href="http|<text|font-family' public/logos/*.svg public/chains/*.svg
```

## Mandatory render verification

Static grep is not sufficient — sandbox failures show up as a blank or broken
render. Write a throwaway Playwright script (the repo already has
`@playwright/test` 1.59.1) that, for **every** SVG you add:

1. Loads it via `new Image()` — the *same* sandboxed path the app uses, **not**
   inline `<svg>` in the DOM, which does not reproduce the sandbox.
2. Draws it into a 100×100 canvas box via `drawImage`.
3. Asserts the result is non-blank and non-transparent (sample the pixel buffer).
4. Writes a contact sheet PNG of new-vs-old side by side to `outputs/` so the
   operator can eyeball all of them at once.

Put scratch scripts in `outputs/` or a temp dir, not in `scripts/`.

## Sourcing

Prefer, in order: the project's own official brand kit / press page → the chain or
issuer's GitHub repo → a reputable aggregator that serves true vector. Avoid
CoinGecko and TrustWallet for this task — they serve raster only. Be skeptical of
`cryptologos.cc`-style mirrors: verify the file is true vector against criterion 1.

If no acceptable SVG exists for a token, **leave the existing raster in place**. A
mixed manifest is fine and expected. Do not substitute a hand-traced approximation
or a visually different variant.

## Landing a swap

For each accepted SVG:

1. Write it to `public/logos/{id}-{symbol}.svg` (or `public/chains/{chain}.svg`),
   matching the existing naming convention exactly.
2. Update the path for every affected id in `data/logos.json`.
3. Delete the superseded raster in `public/logos/` — your change is what orphans it.
   (Chain logos are resolved by `dock.logoPath`, not `logos.json`; confirm how the
   chain path is produced before deleting a `public/chains/` raster.)

## Validation

```bash
npm run check:runtime-media    # allowlists .svg already — must stay green
npm run validate:changed
```

`check:runtime-media` is the targeted gate for this task and **must be green** — it
is the one that actually covers the logo inventory.

`validate:changed` inspects the **whole working tree**, which currently also holds
the concurrent documentation rewrite described in Hard rules. Its `validate:docs`
stage (`check:doc-paths-and-scripts`) may therefore fail on the doc agent's
in-flight deletions. **Any failure whose path is under `docs/`, `README.md`,
`PRODUCT.md`, or `SECURITY.md` is not yours: report it verbatim and move on. Do not
fix it.** Only failures touching `public/logos/`, `public/chains/`, or
`data/logos.json` are in your scope.

Then start the dev server (`npm run dev`, http://localhost:5173/), zoom to maximum,
and screenshot the fleet and the harbour flags into `outputs/`. Confirm sails and
flags are sharper and no logo has gone blank, mis-cropped, or wrongly-aspected.

## Report

Return **under 400 words, no file dumps**. Structure:

- Counts: SVGs landed, split by Batch A / Batch B; how many remain raster.
- A table of any token where you made a judgement call (variant chosen, imperfect
  match, deliberately skipped) with a one-line reason.
- Any candidate rejected for criteria 1–3, with which criterion — this is signal
  about sources, keep it brief.
- Validation command results, verbatim pass/fail.
- Explicit list of what you did **not** finish.
- The brand-colour re-extraction question, restated as an open operator decision.

If you get blocked or a source proves systematically untrustworthy, stop and report
rather than lowering the acceptance bar.

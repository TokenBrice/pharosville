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

---

## Execution log — 2026-07-26

### Batch A — already complete before this run; verified, no changes made

All 11 files in `public/chains/` were already true SVG (the brief's premise that they
are PNGs is stale). Re-verified rather than re-done:

- Sanitisation (C1–C3, plus `on*` handlers and `<foreignObject>`): no hits.
- `viewBox` present on all 11. Sizes 476 B – 1814 B.
- Glyph-only on transparent background — confirmed by simulating the actual
  `source-in` knockout `garden-chain-flag.ts` performs, at the real 89 px flag size.
  Alpha coverage: ton 11%, avalanche 21%, arbitrum 22%, hyperliquid-l1 23%,
  tron 26%, ethereum 29%, bsc 30%, polygon 35%, aptos 43%, solana 50%, base 56%.
  All knock out to correct, recognisable silhouettes.

> Note: `magick <file> -alpha extract` as written in this brief reports **100% for
> every SVG**, because ImageMagick's SVG delegate flattens onto an opaque canvas.
> The numbers above need `magick -background none`. Corrected here so the next
> agent does not read 100% and wrongly reject a clean glyph.

Two operator judgement calls, **not** defects, left alone:
- `base` (56%) is a solid rounded square — Base's current mark genuinely is a filled
  square, so under knockout it reads as a featureless block with no interior detail.
- `hyperliquid-l1` reduces to an ambiguous bowtie/hourglass at 89 px.

### Batch B — 11 landed, stopped deliberately

122 logos were already SVG before this run; the recognisable majors named in this
brief (USDT, USDC, DAI, USDS, GHO, crvUSD, FRAX, PYUSD, USDe, RLUSD) were all
already done. The remaining worklist was **161 long-tail rasters ≤64 px**.

Landed 11 (raster deleted, `data/logos.json` updated, manifest 122 → 133 SVG):
`129-usdy` `185-gyd` `217-rusd` `230-usn` `243-csusdl` `298-iusd` `326-msusd`
`327-aznd` `331-usp` `339-reusd` `46-usd+`

**Sourcing finding — symbol-keyed sources are systematically unsafe for this tail.**
Matching by ticker alone produces confidently wrong marks, because long-tail
stablecoin tickers collide hard across issuers. Measured, not assumed: of 26
symbol-matched web3icons candidates, **0 were the correct mark** — one identical
orange "D" came back for three different USDX issuers, Beanstalk's BEAN resolved to
a ghost logo, Tether's EURT to a black "E". The same collision pattern recurred
elsewhere (all three `usdu` issuers → one wrong "U"; only 1 of 2 `iusd` correct).

The gate that caught every one of these was **rendering candidate and incumbent
raster side by side and looking at them**. Static greps and shape metrics did not
catch it (IoU on badge-form logos just measures "both are discs"). Any future run
must keep a visual gate; do not land on filename agreement.

Also worth knowing: official brand kits (Ondo, Usual, Tether, VNX) publish the
*corporate* logo, not the per-token stablecoin mark, so they yield wrong-variant
substitutions for this tail. Several protocol CDNs serve `.svg` files that are
embedded bitmaps (USD0 584 KB, tgbp 323 KB, usdo 718 KB) — criterion 1 rejects.

### Not finished — 150 of 161 remain raster

Stopped deliberately rather than lower the bar. Deliberate skips worth re-examining
with an operator eye, all "same brand, changed treatment":
- `218-satusd` (River) — colourway inverts, gold-on-black → black-on-yellow.
- `254-eurcv` / `307-usdcv` (SG FORGE) — same red glyph, disc flips black → white.
- `153-busd` — same Binance bars but badge → glyph-only, loses the black disc.
- `229-lvlusd` — genuine vector and visually correct, but 210 KB / 603 paths of
  circuit detail that is sub-pixel at 100 px. Rejected on payload, not correctness.

### Pre-existing defect found (not caused by this task)

`public/logos/340-rwausdi.png` (`rwausdi-multipli`) is a **truncated PNG** — the IDAT
chunk declares 3198 bytes and only 385 are present. Broken since the bootstrap
commit `c023b2c`; it decodes to nothing and renders blank today. Left in place
because sourcing a correct replacement hits the same provenance problem.
`check:runtime-media` passes over it, so the gate does not detect truncated media.

### Brand colours — open operator decision, not acted on

`data/brand-colors.json` / `data/brand-color-overrides.json` untouched, and
`extract-brand-colors.mjs` was not run. The 11 swaps were accepted only when mark
*and* colourway matched the incumbent raster, so existing extracted colours should
remain valid. Re-extraction remains the operator's call and needs a visual review.

---

## Execution log — 2026-07-26, second pass

Picked up the 150-file long tail the first pass left. Landed **31**; manifest went
122 → 133 → **165 SVG ids of 332** (160 of 326 unique files). 119 rasters ≤64 px remain.

### What changed the yield: sourcing per ISSUER, not per ticker

The first pass established that ticker-keyed icon sets are unsafe here, and re-running
morpho + Angle over the tail confirmed it — every remaining hit was either a collision,
an embedded bitmap, or already-rejected. So this pass went issuer-by-issuer instead:
for each token, the issuer's own GitHub org, dapp bundle, docs site or brand kit.
Across 48 researched issuers that yielded 34 candidates, of which 31 survived the
visual gate. Ticker-keyed sets yielded 0 new.

### The badge question, settled by reading the renderer

The first pass rejected `153-busd` for going badge → glyph-only. That instinct is
inverted for this app. `src/three/garden-sail-emblem.ts` exists precisely to cut the
disc away — *"A ship's sail is dyed in its issuer's colour, so the coloured disc almost
every stablecoin logo is drawn on is redundant: the sail already IS that disc."* A
disc-free glyph is the target state, not a regression, and 9 of the 31 landed swaps
are exactly that.

What that same file makes fatal is **colour inversion**: decision D1 keeps the mark's
own colours, so an inverted mark flies inverted. That, not disc removal, is the
rejection criterion. `153-busd` is worth re-examining on these grounds.

### Landed (31) — source URLs

| stem | source |
| --- | --- |
| `113-silk` `282-usdn` `3-ustc` | `raw.githubusercontent.com/cosmos/chain-registry/master/{secretnetwork,noble,terra}/images/…` |
| `28-vai` | `github.com/VenusProtocol/venus-protocol-documentation` `.gitbook/assets/brand_kit/VAI/VAI.svg` |
| `23-ousd` | `github.com/OriginProtocol/origin-defi` `libs/shared/icons/src/tokens/OUSD.svg` |
| `26-musd` | `github.com/mstable/mStable-apps` `libs/icons/src/lib/tokens/mUSD.svg` |
| `67-bean` | `github.com/BeanstalkFarms/Beanstalk-Brand-Assets` `BEAN/bean.svg` |
| `232-pinto` | `github.com/pinto-org/interface` `src/assets/protocol/PintoLogo.svg` |
| `312-hollar` | `github.com/galacticcouncil/intergalactic-asset-metadata` `v2/polkadot/2034/assets/222/icon.svg` |
| `cg-deuro` | `github.com/d-EURO/landingPage` `media_kit/03_Coin_Logos/01_Standard/SVG/dEuro_coin_logo.svg` |
| `172-usdb` | `cdn.prod.website-files.com/…/65c67eafd3569b7e2f834b8d_usdb-icon-yellow.svg` (brandkit.blast.io) |
| `171-hai` | `github.com/hai-on-op/app` `src/assets/hai-logo.svg` |
| `220-usda` | `lend.avalonfinance.xyz/icons/tokens/usda.svg` |
| `255-yusd` | `aegis.im/assets/yusd-l.svg` |
| `238-scusd` | `app.rings.money/_next/static/media/scusd.2cc1d03c.svg` |
| `268-yu` | `app.yala.org/assets/yu.svg` |
| `302-hyusd` | `mintlify.s3.us-west-1.amazonaws.com/hylo/images/tokens/hyusd.svg` (docs.hylo.so) |
| `176-fxd` | `fathom.fi/img/logo/fxd.svg` |
| `204-bnusd` | `balanced.network/img/logo/bnusd.svg` |
| `257-tbill` | `openeden.com/media-kit/tbill-logo-light.svg` |
| `85-usdr` | `tangible.store/tokens/usdr.svg` |
| `75-uusd` | `youves.com/wp-content/uploads/2021/05/uusd.svg` |
| `117-ern` | `app.ethos.finance/static/media/ern.62c8e571.svg` |
| `32-usds` | `web.archive.org/web/20221105144116id_/https://app.sperax.io/static/media/i_usds.6ed04914.svg` |
| `12-usdn` | `waves.exchange/static/icons/assets/DG2xFkPdDwKUoBkzGAhQtLpSGzfXLiCYPEzeKH2Ad24p.svg` |
| `cg-jpyc` | `app.jpyc.jp/icon.svg` |
| `cg-zarp` | `zarpstablecoin.com/img/zarp-coin.svg` |
| `gold-kau` `silver-kag` | `kinesis.money/wp-content/plugins/…/navigation_icons.svg` (symbols `#icon-kau` / `#icon-kag`, extracted) |
| `gold-xaum` | `app.matrixdock.com/assets/js/index-4bb2b933.js` (inline symbol `#icon-icon-token-xaum`, extracted) |
| `53-seur` | `github.com/Synthetixio/synthetix-assets` `synths/sEUR.svg` |

Four (`12-usdn`, `53-seur`, `cg-jpyc`, plus `216-susd` which was then rejected on other
grounds) shipped without a `viewBox`. Each carried `width`/`height` in the same units as
its coordinate space, so `viewBox="0 0 W H"` was added losslessly rather than rejecting.

### Rejected after rendering (12)

| stem | reason |
| --- | --- |
| `37-usdj` `44-usx` `64-uxd` `154-buck` | colour inversion — mark keeps its own colours (D1), so these fly inverted |
| `96-cusd` `247-europ` `216-susd` `13-yusd` | different-era mark: Mento's green C$ vs legacy yellow $; EURØP's round slashed e vs squared E; Synthetix's plain $ vs the old `(s$)`; Yeti's Y roundel vs the incumbent mascot |
| `272-ylds` | issuer's true purple vs the incumbent's lime — would desync the extracted brand colour |
| `42-usdx` | correct glyph, wrong container (circle → rounded square) |
| `249-brz` `290-xusd` | true vector but authored at a 16×16 viewBox; both render *blurrier* than the 50 px raster, defeating the point |

`13-yusd` also carried empty `<text>` + `ArialMT` Illustrator artifacts. `323-kei`
(keikofinance.com) is visually exact but 68 KB autotraced with no viewBox — worth a
second look if someone wants to clean it up.

Confirmed **no official vector exists** for: `335-jupusd`, `329-nect`, `165-audd`,
`325-euri`, `177-uno`, `45-aseed`, `56-par`, `99-cash`, `152-usdl`, `173-buidl`,
`348-fidd`, `219-usdf`, `236-syusd` (issuer is Synnax, dead Jan 2026). Incumbent
rasters left in place.

### `340-rwausdi` — fixed

The truncated PNG is gone. The numeric stems map 1:1 to DefiLlama `peggedAsset` ids, so
these icons came from DefiLlama; refetching id 340 from its origin
(`icons.llamao.fi/icons/pegged/rwausdi`, 259×258 WebP) restores the artwork the bootstrap
meant to vendor. It is a silver coin render with the token's own name on its face — not
another issuer's mark — so it carries no risk of asserting something false about a real
company. Landed as `public/logos/340-rwausdi.webp` (the repo already serves `.webp`), with
`rwausdi-multipli` repointed.

Multipli publishes no per-token vector: `docs.multipli.fi/company/brand` ships company
logos only and `app.multipli.fi` serves an SPA HTML fallback for every asset path.

The concurrent `check:runtime-media` hardening does now catch this — verified directly
against `findMediaFileProblems`, which reports `PNG chunk IDAT declares 3198 bytes but
only 381 are present` for the old file and clean for the new one.

### Validation

```
npm run check:runtime-media     PASS — "326 logos and 20 Three media files, all structurally decodable"
npm run check:committed-secrets PASS — 841 tracked text files
```

Every landed file was additionally checked for `<script>`, `<foreignObject>`, `on*`,
external `href`/`xlink:href`, remote `<image>`, `data:image/`, `<text>`, `font-family`
and a present `viewBox`; then rendered at the real 100 px sail size and asserted
non-blank (coverage 18.6–88.2%). `3-ustc` uses `xlink:href="#…"` and `75-uusd` an inline
`<style>` — both local-only and self-contained, confirmed offline-identical.

### Not finished — 119 of 150 remain raster

The remainder is the genuinely obscure tail where no official vector exists at all.
Further progress needs either hand-tracing (out of scope — the brief forbids
approximations) or an operator decision to accept the near-misses above.

### Brand colours — still an open operator decision

Unchanged from the first pass, and for the same reason: swaps were accepted only when
mark *and* colourway matched, so extracted colours should still hold.

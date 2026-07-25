# Plan: the fleet's sails as heraldry

> **STATUS 2026-07-25: executed.** S0, S1, S2–S5 and D4 shipped in `cec305d`,
> `a66c84c`, `dc3f1c2`, `639c80d`. S6 measured and deliberately NOT done — see
> §7. Outcomes and residuals are recorded there; read it before re-opening any
> decision below.

Operator brief, 2026-07-25: *"The sail coloured in the project/logo colour, the
logo displayed in white on it, and ideally not obviously within a circle but
neatly integrated into the sail — think pirate ships featuring their emblem.
ALL SAILS OF A GIVEN SHIP MUST BE COLOURED; I want to see all kinds of sail
colours in PharosVille."*

Reference: a black-canvas pirate ship with a white skull-and-crossbones painted
directly onto the main course — no frame, no disc, no second colour, the mark
large and flat against the cloth.

This document is the investigation and the plan. Nothing here is implemented
yet. Companion work already shipped: the harbour flags got exactly this
treatment in `527e336` (chain-coloured cloth, disc removed, mark knocked out) —
that commit is the visual target, and its `knockOutMark` is a working reference.

---

## 1. What is actually true today (all measured, not assumed)

### 1.1 The dye already works — except on the ships you are looking at

The batched fleet **already dyes every sail**. `garden-fleet-batch.ts` composites
the sail atlas as:

```glsl
diffuseColor.rgb *= mix(vSailTint, sailTexel.rgb, sailTexel.a);
```

Non-identity sails route to atlas cell 0, which is fully transparent, so
`sailTexel.a == 0` and they take pure `vSailTint` — the ship's brand dye. For
~187 of ~205 ships, requirement 4 is already satisfied.

**The gap is hero ships only.** `shipHeroModelId` (`garden-ships.ts:279`) makes
a ship a hero when its `sizeTier` is `titan` or `unique` — roughly 18 ships, and
by definition the largest and most-looked-at ones. For those,
`attachGardenHeroModel` (`garden-ships.ts:843`) does:

```ts
for (const part of visual.heroHideable) part.visible = false;   // incl. plain sails
...
if (object.name === "wood-hull") material.color.multiply(visual.heroHullTint);
```

Every procedural sail is hidden, the GLB's own canvas is shown, and only the
hull is tinted. The GLB's sail material is authored in
`scripts/pharosville/generate-garden-heroes.mjs:1999` as:

```js
["sail", new MeshStandardMaterial({ color: "#ffffff", name: "hero-canvas",
                                    roughness: 0.8, side: 2, vertexColors: true })]
```

White base × baked vertex colours = the cream canvas in the operator's
screenshot. Its mesh is named `sail-hull` (`generate-garden-heroes.mjs:2067`
names every mesh `${materialName}-hull`), so it is selectable at runtime exactly
the way `wood-hull` already is.

Because the material is `vertexColors: true` with a white base, multiplying
`material.color` by the dye **tints the sail while preserving its baked shading
variation** — the same trick the hull tint already uses. This is a one-line fix,
not a re-authoring job.

### 1.2 The circle is drawn by us, and so is the clutter

`paintSailIdentity` (`garden-sail-texture.ts:251`) currently:

1. fills `livery.logoShape` with `livery.logoMatte` at alpha 0.97,
2. **clips** to that shape,
3. draws the logo inside it,
4. calls `paintIdentityRim` to stroke the shape in `livery.secondary`.

That is the disc and its rim. On top of it `paintSailField` adds a livery panel
(`center`/`hoist`/`quartered`), a stripe pattern (7 variants), bezier weave
lines, and a two-tone bolt-rope border (`SAIL_BORDER_INSET`). The pirate
reference has none of this: plain cloth, seams, one mark.

### 1.3 The blocker: stablecoin logos are discs, not glyphs

This is the finding that shapes the whole plan. Running the alpha-coverage
harness (`outputs/chain-alpha.mjs`) over the 59 token SVGs currently vendored:

| Coverage | Meaning | Count |
|---|---|---|
| **~79.5%** | inscribed circle (π/4 = 78.54%) — a **filled disc badge** | ~53 of 59 |
| 23–57% | genuine glyph or non-circular mark | ~6 |

Nearly every stablecoin logo is a filled coloured circle with a symbol inside.
**The chain-flag technique does not transfer.** `knockOutMark` uses the image's
own alpha as a stencil; applied to a filled disc it yields a solid white circle.
Doing this fleet-wide would replace today's logo-on-a-disc with a *plain white
disc* — strictly worse.

Sourcing our way out is not available either: for chains I found glyph-only
variants because chains have symbol marks. For stablecoins **the disc is the
logo** — there is no glyph-only USDC.

---

## 2. The mechanism: extract the emblem, don't stencil the silhouette

The insight is that a coin logo already *is* the composition we want, just
nested: a brand-coloured disc with a white mark inside it. If the sail is dyed
the brand colour, then **the disc is redundant** — the sail becomes the disc,
and we only need the mark.

So: derive a mask per logo by keying the inner mark against the disc colour,
then use it to **cut the disc away and keep the mark in its own colours**
(decision D1). This is subtractive, not a stencil — unlike the chain flags,
nothing is recoloured.

- **Badge logos** (coverage ≥ ~65%): mask = opaque pixels whose colour differs
  from the logo's dominant colour by more than a threshold. The disc drops out;
  the inner symbol survives, untouched.
- **Glyph logos** (coverage < ~65%): mask = alpha — the mark is already free of
  a disc, so it passes through as-is.

Note this makes the mechanism *simpler* than the flat-ink version: there is no
ink colour to choose per ship, and `knockOutMark`-style recolouring is not used
on sails at all.

### 2.1 Validated on real assets

Prototyped against ten live logos through the real sandboxed `<img>` path. Dye =
the logo's own dominant colour lifted 17% toward canvas; ink = white:

| Logo | Coverage | Branch | Result |
|---|---|---|---|
| 2-usdc | 78% | badge | **excellent** — white USDC ring on blue |
| 5-dai | 78% | badge | **excellent** — white DAI glyph on amber |
| 118-gho | 78% | badge | **excellent** |
| 250-rlusd | 78% | badge | **excellent** — Ripple mark on blue |
| 146-usde | 78% | badge | **excellent** — on near-black |
| 209-usds | 78% | badge | **good** |
| 286-usdg | 78% | badge | good, slight speckle on the ring |
| 1-usdt | 56% | glyph | **FAIL** — featureless white pentagon |
| 6-frax | 23% | glyph | **FAIL** — featureless white circle |
| 110-crvusd | 79% | badge | **FAIL** — gradient logo keys to noise |

The prototype filled the mask with white to make the silhouette legible in one
sheet. Under D1 the *mask* is identical — only the fill changes, from flat white
to the logo's own pixels. Every result below therefore still holds; for the
majority it is visually the same image, because most coin marks are already
white.

**7 of 10 land the pirate look on the first attempt.** The three failures are
not random, and each has a defined cause:

- **Featureless silhouette** (usdt, frax): the coverage test sent them down the
  glyph branch, which knocks out the whole outline and discards the inner
  detail. Fix: do not branch on coverage. Compute *both* masks, score them, and
  pick the better — the contrast mask wins for usdt; frax has genuinely no
  interior detail and must fall through.
- **Gradient / textured art** (crvusd): contrast keying against a single
  dominant colour produces speckle. Fix: detect it (high edge-density or
  ink-share outside a sane band) and fall through.

### 2.2 The fallback (D3): the original logo, unframed

When both masks fail the quality gate, draw the logo **unmodified** on the dyed
cloth — no matte, no rim, no clip. The disc is visible, but far less than it
sounds: **the sail is dyed the same brand colour the disc is made of**, so the
disc largely melts into the cloth and what reads is the inner mark. The residual
is a faint ghost edge from the 17% cream lift in `gardenSailClothColor`, not the
hard grey oval of today.

This has a useful consequence: the extraction in §2 is an *improvement* on a
fallback that is already acceptable, which lowers the risk of the whole change.
A logo that defeats the gate degrades gracefully rather than breaking.

The pre-image invariant is unchanged — the painted ticker still stands in until
a logo resolves (`VISUAL_INVARIANTS.md`); D3 only governs what happens once an
image *has* loaded but cannot be cleanly separated.

---

## 3. Work packages

### S0 — PREREQUISITE: receive and validate the hunter's SVGs, then close the gaps

**Nothing below starts until this is done.** Every later step is tuned against
the logo inventory — the extraction gate, the dominant-colour keying, the
re-extracted dyes, the black-sail set. Tuning against a half-migrated inventory
means tuning twice and trusting neither result.

1. **Receive.** Read the hunter's report; take its counts and per-coin judgement
   calls at face value only as a starting list, not as verification.
2. **Validate independently**, with the harness already built
   (`outputs/chain-alpha.mjs`):
   - every SVG renders non-blank through the sandboxed `<img>` path;
   - static checks pass — no `<image>`/`data:image/` raster wrapper, no
     `<script>`/`@import`/external `href`, no `<text>`/`font-family`;
   - a `viewBox` is present (the real hard requirement — see the hunt brief);
   - the mark matches the coin it replaces, checked on a **contact sheet**, not
     per-file. Coverage numbers alone are not sufficient: an Arbitrum-style
     "innocent 68%" can still be a featureless solid.
3. **Close the gaps myself — under a hard budget.** See S0a below. Sources that
   actually worked for the chain set, in order: official brand kit →
   `simple-icons` (true single-path glyphs) → `web3icons` `networks|tokens/mono`
   (note: served as JS module wrappers, the SVG must be extracted) →
   cryptologos.cc (frequently badges; verify). Path-surgery on a badge is
   legitimate and exact when the disc is a separate path — that is how
   `ton.svg` was derived.
4. **Report the residue.** Coins still on raster, with the reason. A mixed
   inventory is fine and expected; what is not fine is discovering it later.

**Exit criterion:** the inventory is frozen and known-good, and I can state how
many coins are SVG, how many remain raster, and which are badges vs glyphs.
Only then does D4's re-extraction produce a palette worth approving.

### S0a — Search budget for the residual SVGs *(operator instruction, 2026-07-25)*

Some of these are genuinely unobtainable, and the tail will be the worst of them.
Best effort, but do not burn tokens on the impossible.

**Why the cap can be tight:** a missing SVG is *not* fatal to this plan. The
emblem extraction in §2 keys on pixels — it works on a raster exactly as well as
on a vector. A coin left on PNG still gets its disc removed, its mark preserved
and its D5 dye; the only loss is **sharpness at close zoom**, which is precisely
the ~2× upscale the fleet has lived with all along. Giving up on a coin costs
one notch of crispness, not its identity. That is what makes stopping cheap.

**Three tiers, by cost per coin:**

| Tier | Scope | Method | Budget |
|---|---|---|---|
| **T0** | Every missing coin | One **batched** probe across the whole source ladder — the `simple-icons` / `web3icons` / cryptologos URL patterns, all coins in a single scripted sweep | Effectively free (2–3 commands total regardless of coin count). **No cap. Always do this.** |
| **T1** | Top ~25 by on-screen prominence: `titan` + `unique` (the ~18 hero hulls) and the largest `heritage` ships | Bespoke — brand site, docs repo, path-surgery on a badge | **Max 3 source attempts per coin**, then stop and move on |
| **T2** | Everything else | Whatever T0 found | **No bespoke hunting.** If T0 missed it, it stays raster |

**Global stop rules — whichever fires first:**

- **3 consecutive T1 coins yield nothing acceptable** → end the bespoke pass
  entirely. That pattern means the sources are exhausted, not that the next coin
  will be luckier.
- **T1 budget of ~25 coins is spent**, regardless of hit rate.
- Any single coin that has consumed 3 attempts is done. No "one more idea."

**Rejection is a valid, cheap outcome.** Do not lower the acceptance bar to
manufacture a hit — a badge accepted as a glyph is worse than a clean raster,
because it survives the gate and produces a bad emblem instead of an honest
fallback. Prefer raster over a doubtful vector, every time.

**Report** the residue plainly: coins still on raster, which tier they died in,
and for T1 failures a one-line reason. No apology, no retry list — the operator
decides if any individual coin is worth a second look later.

### S1 — Dye hero sails *(unblocks requirement 4; smallest, highest visible impact)*

In `attachGardenHeroModel` (`garden-ships.ts:849`), extend the existing traverse:

```ts
if (object.name === "wood-hull") material.color.multiply(visual.heroHullTint);
if (object.name === "sail-hull") material.color.multiply(visual.sailColor);
```

`visual.sailColor` is already `gardenSailClothColor(livery)` (`garden-ships.ts:349`)
— the exact dye the batched fleet uses, so a titan and a skiff of the same issuer
match. `vertexColors: true` means the multiply preserves the baked canvas shading.

- **Verify:** a titan's every sail reads in its issuer's colour; a titan and a
  standard ship of the same issuer are the same hue.
- **Risk:** low. Confirm no other mesh is named `sail-hull` and that furled/
  rolled canvas uses the same material (check the generator's spar vs sail split).

### S2 — Strip the disc, the rim, and the competing decoration

In `garden-sail-texture.ts`:

- `paintSailIdentity`: drop the `logoMatte` fill, the `clip()`, and the
  `paintIdentityRim` call. Draw the emblem straight onto the cloth.
- On the **identity sail only**, skip `sailPanel` and `stripePattern` — the
  pirate main course is plain cloth. Keep the bezier weave lines (they read as
  fabric) and reconsider the bolt-rope border, which currently frames the mark.
- **Keep** panels and stripes on the *plain* sails: that is where per-ship
  variety should live, and it directly serves "all kinds of sail colours".

Leaves `livery.logoShape` / `logoMatte` unused by the sail. Check other consumers
before removing the fields; if none, that is a follow-up cleanup, not part of this.

### S3 — Emblem extraction, computed once per logo

Best home is the logo store (`use-ship-logo-assets.ts`), which already caches one
`ThreeLogoAsset` per unique `logoSrc` and has a generation key the atlas watches.
Extend `ThreeLogoAsset` with a derived `emblem: HTMLCanvasElement | null`.

Per logo, once:
1. Rasterise to a working canvas (128–192px).
2. Bucket opaque pixels; take the dominant colour = the disc.
3. Build **contrast mask** (colour distance from dominant > threshold) and
   **alpha mask**.
4. Score both (§S4), keep the winner as a white-filled canvas.

Cost is trivial — ~254 logos × one small pixel scan, one time, off the frame path.
Both consumers (`garden-sail-atlas.ts` for the fleet, `createGardenSailTexture`
for heroes) then just draw `emblem` instead of `logo.image`.

### S4 — The quality gate

A mask is accepted when:
- ink share is within a sane band (roughly 4–45% of the logo box) — rejects both
  the featureless disc and the "everything is ink" case;
- it is not speckle — e.g. edge-transition count per inked pixel below a
  threshold, which is what rejects crvUSD's gradient;
- it is not near-identical to the full silhouette, which is the usdt/frax failure.

Prefer the contrast mask; fall back to the alpha mask; fall back to the ticker.
**This gate is the difference between 70% and 95% good sails — it deserves real
tuning against the full inventory, not a guessed constant.**

### S5 — Guarantee contrast by moving the DYE, not the mark

This is the one hazard created by D1, and it needs handling or a slice of the
fleet becomes unreadable.

Most coin marks are **white** (USDC's ring, DAI's glyph, USDT's ₮). Preserving
the mark's own colours therefore means a white mark — and a coin whose brand
colour is pale (pale yellow, mint, near-white) gets **a white mark on pale
cloth**, which disappears. The flat-ink option would have flipped to dark ink;
D1 forbids touching the mark.

So adjust the cloth instead — the dye is ours to choose, the mark is not
(**D5: go full pirate — black sail, white mark**).

**Scale of the problem, measured** over all 255 entries in
`data/brand-colors.json`, running each through `gardenSailClothColor` and
scoring WCAG contrast against white:

| Contrast threshold | Ships below it |
|---|---|
| < 1.6 | 12 (5%) |
| **< 2.0** | **28 (11%)** |
| < 2.5 | 47 (18%) |
| < 3.0 | 69 (27%) |

The palest, worst-first: `usdb-blast` (#ffff07, contrast 1.10), `gyd-gyroscope`,
`usdpt-western-union`, `reusd`, `fdusd`, … and notably **`gho-aave`** (#7de49a,
1.50), **`gusd-gemini`** (#2fdef9, 1.57) and **`dai-makerdao`** (#faba2e, 1.63).

**The rule (settled):** where contrast between the mark and the cloth falls
below **2.0**, dye the sail near-black and let the white mark carry the ship.
That is **28 ships, 11%** — enough to fix the genuinely illegible without
turning a fifth of the fleet black.

**The black is hue-preserving, not `#000`.** Take the brand primary, keep its
HUE, clamp saturation and drop lightness:

```
h, s, l = hsl(brand.primary)
pirateBlack = hsl(h, s = 0.40, l = 0.07)
```

Worked against the real palette — every one clears the 2.0 gate by ~9×, while
keeping a legible hue cast at close range:

| Coin | Brand | Pirate black | Contrast vs white |
|---|---|---|---|
| dai-makerdao | `#faba2e` | `#19150b` warm brown-black | 18.3 |
| gho-aave | `#7de49a` | `#0b190f` green-black | 18.1 |
| gusd-gemini | `#2fdef9` | `#0b1719` blue-black | 18.2 |
| usdb-blast | `#ffff07` | `#19190b` olive-black | 17.7 |
| fdusd | `#1ffe98` | `#0b1912` green-black | 18.1 |
| usdpt-western-union | `#ffde0c` | `#19170b` amber-black | 18.0 |

At overview zoom (~25px) these read as black pirate canvas; up close each is
still faintly its own colour, which matters for DAI and GHO where the hue is a
strong recognition cue. These 28 become the fleet's black-sail squadron.

`identityInk` reverts to being the ticker-only helper it originally was.

### S5a — Architectural consequence: the dye now depends on the mark

Worth flagging early because it will otherwise derail the implementation.
`gardenSailClothColor(livery)` is today a **pure function of the livery**
(`garden-ships.ts:349` feeds both the hero material and the batch's per-instance
tint). The D5 trigger is contrast between the *extracted mark* and the cloth —
so the cloth colour can no longer be computed from livery alone. It depends on
S3's output, which only exists once the logo has loaded and been keyed.

Ships are built before logos resolve, so this needs the same treatment the atlas
already has: the sail tint must be **refreshed on the logo generation bump**, not
only at construction. The batch path looks workable — `garden-fleet-batch.ts:466`
writes `sailTint` from `pose.sailColor` during pose sync, so updating
`visual.sailColor` should propagate. The hero path (S1) writes
`material.color.multiply(...)` once at attach and will need an explicit re-apply.

Verify explicitly: a ship must not flash its pale dye and then snap to black
when the logo lands. If that flash is visible, compute the D5 set ahead of time
from `data/brand-colors.json` (which is a build artefact and known before any
image loads) rather than from the runtime extraction.

### S6 — Resolution headroom *(optional, measure first)*

Emblems are drawn into ~100px inside a 128px atlas cell. A thin ring like USDC's
is near that limit at max zoom on a HiDPI display. Options, in preference order:

1. Decouple hero sails from the atlas cell size and paint them at 256px — heroes
   are the ships you zoom into, and it costs a handful of textures.
2. Raise the fleet atlas to 256px cells (4096², ~17MB → ~67MB VRAM) — uniform
   but expensive for ships mostly seen small.

Do this **after** S1–S5 and only if measurement justifies it.

### S7 — Verification

Use the deterministic rig from the flag work — `outputs/logo-ab.spec.ts` +
`logo-ab.config.ts` (fixture data + wall-clock override + reduced motion; control
pairs measure exactly 0 RMSE).

**Caveat that must be respected:** per `CLAUDE.md`, never judge looks or
performance through Playwright — it falls back to SwiftShader. The rig is valid
for *content* questions (is the emblem present, correctly shaped, correctly
coloured, unchanged elsewhere). Final visual sign-off goes through
`npm run preview`.

Additionally: generate a **contact sheet of all ~254 extracted emblems** on their
dyed fields, as one image. That is the only practical way to spot the crvUSD-class
failures across the whole inventory, and it is how the three failures above were
found.

---

## 4. Sequencing

S1 is independent and immediately visible — ship it alone and look at it.
S2 + S3 + S4 + S5 form one coherent change and should land together, because S2
without S3 leaves logos unframed but still disc-shaped. S6 and the atlas question
come last, gated on measurement.

## 5. Risks and open decisions

| # | Item | Note |
|---|---|---|
| R1 | Extraction is heuristic | ~7/10 unaided. The gate plus the D3 fallback bounds the downside, but expect a tail needing per-coin overrides. A `data/emblem-overrides.json` (mirroring `brand-color-overrides.json`) is the natural escape hatch. |
| R2 | **White mark on pale cloth** | Created by D1, resolved by D5 — 28 pale-branded ships (11%) get a near-black sail. See S5. |
| R2b | **A black sail could be read as a signal** | PharosVille encodes meaning in colour (health bands, sea zones), so a black sail risks being read as "this coin is in trouble" when it only means "this brand is pale yellow". Mitigations: keep the brand-hue whisper so it reads as a very dark version of *their* colour rather than a distinct state; confirm nothing else in the world uses black canvas; and check the legend does not need a line. **Worth a deliberate look once the 28 are on screen together.** |
| R3 | Ghost disc on fallback ships | D3 accepts a visible disc where extraction fails. Softened by the dye matching the disc, but the 17% cream lift leaves a faint edge. If it reads badly, the lever is to reduce the lift on the emblem sail specifically. |
| R4 | Brand-colour re-extraction | Resolved by D4 — re-extract, with a before/after fleet sheet for approval before it lands. Must happen before sail colour is judged. |
| R5 | Concurrent agents | The SVG hunter is still changing `public/logos/` and `data/logos.json`. Tuning the gate against a moving inventory will mislead — tune after Batch B settles. |
| R6 | Livery fields going dead | `logoShape` / `logoMatte` lose their consumer; confirm no other reader before removing. |

## 6. Decisions taken (operator, 2026-07-25)

| # | Decision | Consequence |
|---|---|---|
| **D1** | **Preserve the mark's own colours.** Remove the disc; do not recolour what is inside it. | Mechanism becomes subtractive, not a stencil — simpler than flat ink. Creates R2; handled by S5 moving the dye instead of the mark. |
| **D2** | **Clean emblem sail, patterned plain sails.** Identity sail = dyed cloth + weave seams + mark, bolt-rope border dropped. Plain sails keep livery panels and stripes. | Variety lives on the plain sails; the emblem sail reads as a pirate main course. Scopes S2. |
| **D3** | **Fallback = the original logo, unframed.** No matte, no rim, no clip. | No ticker-emblem path needed. Degrades gracefully because the dye matches the disc. |
| **D4** | **Re-extract brand colours from the new SVGs**, then review before landing. | Dyes get more accurate and match their logos. Every ship's colour may shift; requires a before/after fleet sheet. |
| **D5** | **Full pirate for pale brands: near-black sail, white mark.** Threshold **contrast < 2.0** (28 ships, 11%). The black is **hue-preserving** — `hsl(brandHue, s 0.40, l 0.07)`, not `#000`. | Resolves R2 without touching the mark (honours D1). Introduces R2b, and the dye-depends-on-mark ordering problem in S5a. |

### Sequencing

0. **S0 first — hard prerequisite.** Receive, validate and complete the SVG
   inventory. The operator gates this: the hunter finishes before I start.
1. **S1** — hero sail dye. Independent of every decision above and of the
   hunter; one line, immediately visible on the ships in the screenshot. Can be
   pulled forward if wanted.
2. **D4** — re-extract and approve the palette. Everything visual downstream
   depends on the dye being final, including which ships fall under D5.
3. **S2–S5 together** — S2 without S3 leaves logos unframed but still
   disc-shaped, which is just the D3 fallback applied fleet-wide.
4. **S6 last**, gated on measurement through `npm run preview`.

---

## 7. Outcome (2026-07-25)

Executed as planned. What the fleet actually does now, all measured:

| | Result |
|---|---|
| Logos yielding a clean emblem | **307 of 326** (94%) |
| Falling through to D3 (unframed logo) | 19 |
| Cloth: black (D5) / dark / mid / pale | **26 / 46 / 178 / 6** |
| Real-GPU frame | 60 fps, tier `full`, 0 dropped of 120, 476 draw calls |

S0 closed with 122 of 332 manifest entries on vector. The batched symbol sweep
found 38 candidates for the raster tail and **only 7 were the right coin** —
ticker collisions returned an unrelated infinity mark for ERN, a different
project for USDX, a pink bean for BEAN. Caught only by putting each candidate
beside the raster it would replace; coverage metrics pass a wrong logo happily.
The remaining 208 stay raster by choice: the emblem keys on pixels, so it reads
a raster as well as a vector.

### What changed against the plan

- **D2's premise was wrong.** The plan said "plain sails keep livery panels and
  stripes". They never had any — `createGardenSailCanvas` only ever paints the
  IDENTITY sail; plain sails take a flat dye from the shader or their material.
  So honouring "clean emblem sail" means no patterns anywhere. Fleet variety
  now comes from the dye (including 26 black sails), not from cloth pattern.
- **S5's dye-move was tried and reverted.** Capping cloth lightness at 0.42
  fixed emblem contrast but pulled Circle blue and Tether green from 0.31 apart
  to 0.24 — buying legibility by making two issuers harder to tell apart, which
  is what F1 exists to prevent. Replaced with a soft relief under the emblem,
  which costs neither invariant.
- **S5a's ordering problem never materialised.** D5 keys on the brand colour
  against white, so the cloth stayed a pure function of the livery and no ship
  flashes pale before its logo resolves. The escape hatch was the design.

### Residual, and the one-line lever

Six issuers still fly a pale cloth where a light mark reads weakly:
`bean-beanstalk`, `cash-phantom`, `csusdl-coinshift`, `dai-makerdao`,
`eusd-lybra`, `zchf-frankencoin`. DAI sits at contrast 2.06 — just above the
2.0 floor, so it keeps its amber rather than going black.

Raising `PIRATE_CONTRAST_FLOOR` from 2.0 to ~2.2 sweeps all six under black
sail. It is one constant. It was NOT changed because 2.0 is an operator
decision (D5) and DAI's amber is a strong recognition cue worth keeping.

### S6 (resolution) — measured, not needed

At max zoom on the real GPU the emblem is not texture-starved: the 128px atlas
cell is adequate and nothing in the frame is limited by it. Raising the atlas
to 256px cells would cost ~17MB → ~67MB VRAM for no visible gain. **Skipped.**

### Anisotropy — honest result

Re-measured on the real GPU (RTX 5070 Ti through the operator's Chrome wrapper)
after `CLAUDE.md` ruled out Playwright for visual judgement:

- anisotropy 1 vs 16, static frame: **0.217% RMSE**
- same code twice, control: **0.150% RMSE**

The effect is at the noise floor. It is kept because it is free — no memory
cost, 60fps unchanged, and it is the correct setting for an upright quad in an
oblique view — but **no visible benefit was ever demonstrated, on either
renderer.** Do not cite it as an improvement.

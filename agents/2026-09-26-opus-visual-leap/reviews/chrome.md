# DOM chrome, typography & arrival — chrome

## Verdict
The scene-first skeleton is right. One caption and one affordance sit on the world (`noon.png`), and the card opens behind a disclosure. The finish is not. The first thing every visitor sees is a stale **noon** photograph with the old v0.16.0 footer and black disc buttons still in it (`public/pharosville/stills/garden-noon.jpg`). A night visitor gets that noon still and then a 320 ms cut to 22:00. That breaks the wall-clock premise before the garden has said a word. After that, every piece of chrome is a flat rectangle: a navy caption box, a tan card with a hard 4 px offset shadow, grey 10.5 px nameplate chips at ~2:1 contrast, and native buttons in the light drawer. They read as a dashboard skin rather than a printed layer on the garden. At night the token swap makes the card's links invisible (`chrome/selected-ship-night.png`). The leap costs zero draw calls: an arrival that develops out of a still matched to the hour and pose, a now-line in three typographic voices, and a real washi record card.

## What I looked at
- **Baseline frames:** `noon.png`, `golden.png`, `dawn.png`, `night.png`, `deep-night.png`, `compact-1200x640.png`, `noon-1440p.png`, `selected-ship.png`, `selected-lighthouse.png`, plus the loading/gate still `public/pharosville/stills/garden-noon.jpg` (1280×800, 120 KB).
- **My captures** (`outputs/opus-review/chrome/`):
  - `selected-ship-night.png` (`#t=22&sel=ship.usdc-circle`, tier full): the night card.
  - `legend-night.png` (`--legend #t=22`, tier full): **no legend appears**. First visit no longer auto-opens it (`src/hooks/use-legend-dialog.test.tsx:46`), so the preview `--legend` flag is stale.
  - `hover-golden.png` (`--hover-first #t=17.6`, tier **recovery**; I only use it for DOM styling, which is tier-independent). Its retry hit a GPU-contention timeout.
  - `arrival-night.png` plus `arrival-night-frames/00–05.png` (motion sheet, `#t=21 --settle 0`, 6 frames every 1.5 s, tier `interaction`, expected while the arrival camera moves). The first attempt timed out.
- **Code read:**
  - `src/pharosville.css` in full (tokens :32-101, loading :128-168, gate :232-325, card :494-732, caption/controls :742-876, chips :1381-1451, hover :1452-1490, observe :1498-1524, light drawer :1814).
  - `src/client.tsx:8-95`, `src/pharosville-world.tsx:280,485-488,1059-1255`.
  - Components: `now-caption.tsx`, `world-controls.tsx`, `detail-panel.tsx:1-237`, `harbor-label-chips.tsx`, `legend-panel.tsx:97-273`, `since-last-visit.tsx`, `desktop-only-fallback.tsx`, `rotate-to-landscape.tsx`.
  - Systems: `src/systems/detail-model.ts:62-112,1085-1118`, `garden-arrival.ts:3-4,44-50`, `garden-arrival-beats.ts:95`.
  - Assets: `index.html`, `public/fonts/` (EB Garamond 400, 400 italic, 600 declared; the **700 file ships but has no `@font-face`**).
  - History: prior lane `agents/pharosville-reborn/reviews/ui-hud-inventory.md`, plan §W5 and the rejected list (`01-implementation-plan.md:204-214,336`), the decision ledger.
- **Contrast:** computed from the CSS tokens (WCAG relative luminance, translucent layers composited over sampled scene colours).

## Spell-breakers (defects)
1. **The arrival and the gate show a stale, wrong-hour photograph with old UI burned into it.**
   - **What:** `garden-noon.jpg` contains the v0.16.0 footer ("PharosVille v0.16.0 · Legend · Find / · Harbor ledger Readings current · 142 of 185 have harbor ties · 60 fps") and the three black disc controls, from an older scene build. It is upscaled from 1280×800 to cover the whole viewport.
   - **Where:** `client.tsx:10,92`; `pharosville.css:141` (loading) and `:238-256` (both gate branches).
   - **Why it breaks the calm:** every visitor, at every hour, first sees a noon that isn't now, then a 320 ms cut (`garden-arrival.ts:4`) to the real hour. It breaks "wall clock owns illumination / no flattering default hour" before the first frame.
   - **Fix:** idea chrome-1. **Cost:** S–M.
2. **At night the card's links and section titles disappear.**
   - **What:** `:root[data-phase="night"]` redefines `--stone` to `#332a1f` (`pharosville.css:98`). `.pv-panel-link` (:914), `.pv-section-title` (:882) and the link focus ring (:930) still paint in `var(--stone)` on the night card. The result is **1.23:1**.
   - **Where:** `chrome/selected-ship-night.png`, top-right: "Stablecoin →" is a ghost. The Identity/Position/Links headings inside "Read the record" use the same token [INFERENCE: computed, not captured open].
   - **Why:** the primary link is unreadable at night. That is an AA failure on the most-used chrome.
   - **Fix:** stop redefining shared tokens per phase and give text roles their own names (`--pv-text`, `--pv-text-quiet`, `--pv-link`) with an AA pair per phase. See chrome-6. **Cost:** S.
3. **Arrival nameplates are illegible, pop in and out, and flatten severity.**
   - **What:**
     - The chip is 18 px tall. Its whole element sits at `opacity: .68` over a 55 % scrim (`pharosville.css:1400-1409`), the name is 0.66 rem (10.5 px, `:1443`), and the initials are 7.4 px monospace (`:1432`). Contrast is **~2.0:1 at noon and ~2.2:1 at golden**.
     - Visibility flips with `visibility` and no fade (`:1415,1423`), so the chip pops in and out (`arrival-night-frames/02.png` → `05.png`).
     - "Danger" gets the same muted grey as "Calm" (`arrival-night-frames/05.png` "Resupply USD Danger"; `:1447-1450`).
   - **Where:** a grey box floats mid-frame, left of the tower, in `dawn.png`, `golden.png`, `night.png` and `compact-1200x640.png`. At golden hour it is a cold slate rectangle cut into the amber haze. At `noon-1440p.png` it can't be read at all.
   - **Why:** it is the only in-world typography, and it reads as a debug label.
   - **Fix:** chrome-5. **Cost:** S.
4. **The card header crams its status into a 116 px column and argues with its own sentence.**
   - **What:** `grid-template-columns: minmax(0,1fr) 116px` (`pharosville.css:529`) breaks "Calm / Anchorage / -1 bps vs / USD" into four ragged lines (`selected-ship.png`, top-right). The negative is a hyphen-minus (`detail-model.ts:1115-1117`, `${sign}${rounded}`).
   - **Also:** the seal says **Calm Anchorage** while the prose says "Early-warning stress set this berth" (`detail-model.ts:1088`). A reader sees calm and stress at once [INFERENCE: DEWS placement reason with a calm-band zone label; data-story lane should check].
   - **Fix:** chrome-3 layout, U+2212 minus, and a narrative that agrees with the band. **Cost:** S.
5. **The Close focus ring is the loudest mark on the card.**
   - **What:** focus moves to Close on mount (`detail-panel.tsx:104`), and a 2 px black box (`pharosville.css:723-727`) shows whenever the panel opens from a deep link or the keyboard (`selected-ship.png`, `selected-lighthouse.png`).
   - **Why:** the eye lands on "Close" before the title.
   - **Fix:** focus the `h2` (`tabIndex=-1`) so a screen reader reads the title first, and make the ring 1.5 px ink at 4 px offset with a 2 px radius. It stays visible for keyboard users. **Cost:** S.
6. **The caption's live region speaks every minute.**
   - **What:** `captionHour` is quantised to the minute (`pharosville-world.tsx:280`), and the visible caption is itself `aria-live="polite"` (`now-caption.tsx:30`). A screen reader hears "21:04 — a quiet night · readings current" every 60 s.
   - **Why:** a chatty live region is the audio equivalent of a blinking badge.
   - **Fix:** in chrome-2. **Cost:** S.
7. **Night controls miss AA.**
   - **What:** "Explore" is night `--mist` `#767b9c` on a water-84 % backing: **4.4:1** at 12 px. The `/` kbd is **3.4:1** (`pharosville.css:805,819`). It shows as a dim smudge bottom-right in `night.png` and `deep-night.png`.
   - **Fix:** chrome-6 roles. **Cost:** S.
8. **The Light & motion drawer is unstyled native UI.**
   - **What:** `.pharosville-light-control__panel` is one line of CSS (`:1814`). Its buttons, checkbox and `<input type=time>` (`world-controls.tsx:116-125`) render with platform defaults on a navy slab [INFERENCE from code; not captured open].
   - **Why:** it is the one place the product looks unfinished, and it is the control for *time*, the premise.
   - **Fix:** chrome-7. **Cost:** S.
9. **First-time visitors are told nothing, and the legend, when opened, reads like a spec.**
   - **What:** the legend no longer opens on first visit (`legend-night.png`; `use-legend-dialog.test.tsx:46`), and nothing replaces it. Its copy leaks internal vocabulary: "The fleet follows the leg/rest contract" (`legend-panel.tsx:196`), "titans", "compressed, not linear".
   - **Fix:** chrome-4. **Cost:** S.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### chrome-1 ★ The photograph develops: an arrival that matches the hour and the pose
- **Picture:** You open the page at 21:40 and a still of *this* harbour at night is already there. The beacon is lit, the water is dark, and one italic line sits where the caption will live: *"Charting market winds…"*. When the data lands, the still dissolves over 1.4 s into the live scene, pixel-registered, so nothing jumps. Then the moving world takes over: the beam turns, the camera begins its slow nine-second settle, and the line becomes "21:40 — a quiet night". It feels like a photograph developing in a tray, not a loader handing over to an app.
- **Why:**
  - Defect 1: the noon-only still with stale UI, a 320 ms cut, and the loading text centred in 600-weight tracked system-sans over a violet wash (`pharosville.css:135-146`).
  - The arrival camera starts at a known pose, `offsetX−72, offsetY+48, zoom×0.82` (`garden-arrival.ts:44-50`). A still captured at *that* pose registers with frame 0 of the dolly.
  - The same still serves the gate (`client.tsx:66-88`), so the invitation page stops showing a stale product.
- **Impact:** 5 stunning / 5 relaxing (first impression and wall-clock truth). **Confidence:** H.
- **Cost:** M. **Perf:** 0 draws / 0 tris / 0 GPU ms / 0 scene textures. One ~60–90 KB AVIF per visit instead of the 120 KB JPEG.
- **How:**
  - **Stills.** Ship five chrome-free stills, one per beat (`dawn/day/golden/blue/night`, AVIF plus a JPEG fallback, 1920×1200), under `public/pharosville/stills/`.
  - **Regeneration.** Generate them with a small script over `scripts/pharosville/preview.mjs`. Add a `--clean` flag that injects `.pharosville-world-chrome,.pharosville-overlay,.pharosville-debug-chrome{display:none}`. Capture at the arrival start pose: `#t=<beat>&cam=<rest.x−72>,<rest.y+48>,<rest.zoom×0.82>`. Rerun it at release, so stills never go stale again.
  - **Choosing a still.** `client.tsx` picks one with a 10-line pure `stillForLocalHour(new Date())`, mirroring beat windows from `dayCycleBeats`. Import only the tiny beat helper, or inline the hour table, so gate and loading still boot no world code (`client.tsx:64-65` contract).
  - **Loading text.** Move "Charting market winds…" out of the centred grid into the caption slot (bottom 26 px, left 30 px). Use the same class family and type as the now-line (chrome-2), so the loading sentence *becomes* the first caption without moving.
  - **Dissolve.** In `pharosville.css:155`, go from `opacity 320ms` to `opacity var(--pv-motion-duration-develop)` with a new token of 1400 ms, `cubic-bezier(.33,0,.2,1)`. `GARDEN_ARRIVAL_CROSSFADE_MS` (`garden-arrival.ts:4`) follows. Start the camera dolly at 60 % of the dissolve, so the motion emerges from the still rather than coinciding with the cut.
  - **Veil gradient.** Drop the 18 %→72 % violet gradient (`:136-140`). A real hour-matched still needs no darkening. Keep a 28 % bottom-left feather only behind the text.
- **Displaces:** the stale noon JPEG, the centred tracked loading label, the 320 ms cut, and the gate's dark 94 % slab (`pharosville.css:249-253`; gate copy then sits on a feathered scrim, as in chrome-2).
- **Truth & a11y:**
  - No analytical meaning. The stills hold no data: a data-free, chrome-free *scene* at the right light, with the fleet as it was at capture. Alt text per beat ("PharosVille at night: the lit lighthouse over dark water, ships at anchor").
  - The `role=status` text is unchanged.
  - **Reduced motion:** the still swaps instantly to the static tableau (0 ms) and no dolly runs (existing path, `pharosville-world.tsx:1086-1091`).
- **Risks:**
  - The fleet in a still drifts from the live fleet. At a 1.4 s dissolve that reads as the tide moving, which is acceptable.
  - Registration breaks if the rest camera changes, so the regeneration script must run in the release checklist.
  - Five images add ~400 KB to the repo.
  - Tests pin `"Charting market winds…"` and the veil stages (`pharosville-world.test.tsx:280-294,792-798`); stage names stay, timing constants change.
- **Acceptance:** motion sheet `--settle 0 --frames 8 --interval 250` at `#t=22` and at `#t=12`. Frames 0–4 must show no hour jump, no lateral shift at the dissolve, and no chrome in the still. The gate at a 1200×600 window shows the hour-matched still.

### chrome-2 ★ The now-line: one sentence in three voices
- **Picture:** Bottom-left, with no box, a small line of print sits in a soft pool of shade: `21:40` in quiet tabular figures, a hairline, *a quiet night* in Garamond italic, then "· readings current" a step lighter. When the sentence changes (a ship arrives, the hour turns), the old words fade out and the new ones fade in over about two seconds. On a large display it grows with the picture instead of shrinking into a footnote.
- **Why:**
  - Today it is a navy 82 % hard-edged box (`pharosville.css:748-750`). In `golden.png` that box is a cold rectangle cut into warm haze.
  - It carries a redundant text-shadow inside an opaque box (`:755`) and a fixed 16 px size, which reads as a footnote at `noon-1440p.png`.
  - The time, the poem and the provenance share one weight and one colour, so nothing reads as poetry.
  - The vocabulary is thin: 22:00 and 02:30 both say "a quiet night" (`night.png`, `deep-night.png`; `detail-model.ts:81-91`).
  - Defect 6: the live region speaks every minute.
- **Impact:** 4 poetic / 4 relaxing. **Confidence:** H.
- **Cost:** S–M. **Perf:** 0 / 0 / <0.05 ms, one composited DOM layer, scaled for the operator's DPR 2 [INFERENCE] / 0 textures. No per-frame JS; the text changes only at sentence boundaries.
- **How:**
  - **Markup.** `now-caption.tsx` renders `<p><time/><span class="phase"/><span class="prov"/></p>`. Split `nowCaption()` into a structured `{clock, phrase, clause}` and keep the string form for tests and the screen reader.
  - **Type.**
    - Time: `var(--font-ui)` 500, `clamp(12px, .55rem + .28vw, 15px)`, `tabular-nums`, `letter-spacing:.04em`, text at 78 % strength.
    - Separator: a 1 px × 0.9 em hairline (`::before`, currentColor at 40 %) instead of the em dash.
    - Phrase: EB Garamond *italic* 400, `clamp(17px, .7rem + .5vw, 23px)`.
    - Clause: Garamond roman at 0.86 em, 72 % strength.
  - **Backing.** Replace the box with a feathered scrim anchored to the corner: `background: radial-gradient(130% 160% at 0 100%, color-mix(in srgb, var(--pv-air-ink) 80%, transparent) 0 40%, transparent 72%)`, padding `18px 40px 18px 30px`, no border, no radius. The scrim core under the glyphs keeps ≥4.5:1 (chrome-6 supplies `--pv-air-ink`, deep umber at golden and indigo at night).
  - **Cadence.**
    - Crossfade on sentence change: 800 ms out, then 1000 ms in, keyed on the sentence.
    - The clock still ticks each minute, but only the `<time>` swaps, with no fade and no announcement.
  - **a11y.** Remove `aria-live` from the visible `<p>`. Add a sibling `sr-only` `role=status` that updates only when the *phrase or clause* changes: arrival, transition, stale feed, phase. Never on the minute.
  - **Vocabulary** (data-story lane owns the table): hour words from `clockLabel`: *the small hours* (0–4), *first light* (dawn beat), *late morning*, *late afternoon*, *evening* (20–22). One PSI-band tone word per band instead of the binary quiet/watchful (`detail-model.ts:83`). Arrival copy drops "in the window" (`garden-arrival-beats.ts:95`): "Resupply USD comes in to Ethereum · supply rising".
- **Displaces:** the navy caption box, the redundant text-shadow, the per-minute announcement.
- **Truth & a11y:**
  - Precedence (`detail-model.ts:93-111`) is unchanged, so a stale feed still overrides the poem.
  - **Warning state:** the phrase becomes roman, not italic, with a 10 px risk-toned ◆ glyph plus words, so it never relies on colour alone.
  - **Reduced motion:** swaps are instant.
- **Risks:**
  - Scrim legibility over bright noon water: prove it by pixel-sampling the glyph box at all seven baseline hours.
  - Unit tests pin the exact strings (`now-caption.test.tsx:24`, `detail-model.test.ts:79,98`); the string form survives.
- **Acceptance:** seven stills at the baseline hashes, cropped to the bottom-left 600×120. There must be no visible rectangle edge, and contrast behind the glyphs must stay ≥4.5:1 in all seven (sample 20 px around the text bounds). At `noon-1440p` the phrase renders ≥21 px.

### chrome-3 ★ The record card as a washi print
- **Picture:** Selecting a ship lifts a sheet of unbleached paper onto the air. Faint fibre catches the light, and the ink is soft black. A small square seal in the band's colour sits beside an italic kind-line ("a stablecoin"), then the title in Garamond, then one line of status: *Calm Anchorage · −1 bps vs USD*. A short rule separates it from the sentence, and three small figures sit in a row, labelled like a print's colophon. At night the same sheet is indigo-dyed, with pale ink and links you can read. It feels printed, not rendered.
- **Why:**
  - Today's "woodblock" card (`pharosville.css:494-504`) is a flat `#d7c7a9` cardboard tan (mist 92 % + stone) with a brutalist 4 px hard offset shadow. It is the largest uniform, saturated surface in `selected-lighthouse.png` and blocks the sky band top-right.
  - The status column wraps into four lines (defect 4).
  - Figures are system-sans **bold** 14 px, the heaviest ink on the card (`:618`, "$76.6B · #2 of 184 · +0.2% 24h").
  - Kind is tracked uppercase "SHIP" (`:544-550`), dashboard grammar.
  - Close has a black box (defect 5), and the night card loses its links (defect 2).
- **Impact:** 4 stunning / 4 poetic (the panel opens on every selection). **Confidence:** H.
- **Cost:** M. **Perf:** 0 / 0 / <0.05 ms [INFERENCE] / 0 scene textures. The SVG grain is a DOM background rasterised once by the compositor, not a WebGL texture, so it does not count against the 72-texture ceiling.
- **How:**
  - **Surface.**
    - Day: `color-mix(in srgb, var(--mist) 55%, var(--pv-parchment) 45%)` ≈ `#e5dfce`. Ink `#1a1612` is **13.1:1**, quiet ink (ink 72 % + stone) 11.2:1, stone links 6.4:1.
    - Night: `color-mix(in srgb, var(--water) 92%, var(--pv-parchment) 8%)` ≈ `#26223f`. `#e8eef0` is 13.0:1, mist 10.2:1, quiet 5.65:1.
  - **Grain.** `background-image: url("data:image/svg+xml,…<feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/>…")` at `opacity .05`, `background-blend-mode: multiply` on day and `screen` at 4 % on night. Static; no animation.
  - **Edge.** 1 px hairline border in `color-mix(ink 22%, transparent)`, plus one inset hairline 3 px in (a double rule, like a print's keyline). Replace the offset shadow with `0 22px 44px -28px color-mix(in srgb, var(--pv-shadow) 55%, transparent)`, paper lifting off the water.
  - **Layout.**
    - Header becomes one column. The seal (34 px square, 1.5 px risk border, 18 % risk-tint fill, centred 12 px dot) floats right of the kind-line.
    - The zone line sits under the `h2` in `var(--font-ui)` 500 13 px with `tabular-nums` (`detail-panel.tsx:122-152`; `pharosville.css:526-593`).
    - A 32 px short rule, not full width.
    - The reading line becomes three cells, each an italic Garamond 12 px label (*supply*, *rank*, *24h*) over `font-ui` 500 15 px figures (`buildDetailReadingLine` → return parts; `detail-panel.tsx:160-164`).
  - **Type.** Kind is Garamond italic 15 px, lowercase ("a ship", "the lighthouse"), and replaces the tracked caps. The title is Garamond 600 30/1.05.
  - **Focus and links.** Links and Close in quiet ink. Focus goes to the `h2` on mount, and the button ring becomes 1.5 px ink at 4 px offset. Use U+2212 in `pegDeviationLabel` (`detail-model.ts:1115`).
  - **Entrance.** `pv-panel-enter` (`:1237-1250`) goes to 380 ms settle with a 4 px rise, and the paper fades in 60 ms before its text.
- **Displaces:** the tan cardboard fill, the hard offset shadow, the 116 px status column, the bold figures, the tracked uppercase kind, and the black focus box. Also the ledger's `.pharosville-ledger__record` (`:1185-1231`), which should share the new material.
- **Truth & a11y:**
  - The band still reads as words ("Calm Anchorage") plus the seal; colour is never the sole carrier.
  - All figures and disclosures are unchanged. Focusing the heading improves screen-reader context.
  - **Reduced motion:** no rise; opacity only, 0 ms.
- **Risks:**
  - Grain can look like dirt at low DPR; cap it at 5 % and judge on the real GPU at DPR 1 and 2.
  - The prior plan rejected "paper grain" for the *WebGL frame* (`01-implementation-plan.md:336`). This is DOM-only on reading surfaces; see Reversals.
  - Tests may pin the focus target (Close) and the `data-testid`s. The anchored-dock geometry (`pharosville.css:455-491`) is untouched.
- **Acceptance:** `#t=14&sel=ship.usdc-circle` and `#t=22&sel=ship.usdc-circle` at 1600×1000:
  - the status fits on one line;
  - no element on the card is darker or heavier than the title;
  - every text/link ≥4.5:1 in both captures (sample "Stablecoin →");
  - no hard shadow edge;
  - grain visible only at 100 % zoom inspection.

### chrome-4 First-visit three lines, and a legend that reads like a field guide
- **Picture:** On a first visit, when the arrival dolly settles, the caption slot speaks three short lines, one at a time, each held about seven seconds: *Each sail is a stablecoin.* → *The water beneath it is its peg risk.* → *The lighthouse keeps the whole fleet's stability — press / to find a ship.* Then the now-line returns and never repeats. The Legend, when opened, is a short field guide on the same paper as the card, not a spec sheet.
- **Why:**
  - First-run orientation is gone: the legend is closed by design (`use-legend-dialog.test.tsx:46`; `legend-night.png` shows nothing), and W5.3's story was deferred to Ext (`01-implementation-plan.md:210`).
  - The legend copy reads as an engineering doc: "leg/rest contract" (`legend-panel.tsx:196`), "titans", "compressed, not linear", and a 17-line paragraph at `:207-220`.
  - The dialog uses the changelog's dark chrome with 1.04–2.06 rem mixed sizes and 900-weight gold headings (`pharosville.css:934-991,1256-1379`).
- **Impact:** 4 poetic (teaches through observation, principle 3). **Confidence:** M.
- **Cost:** S. **Perf:** 0 / 0 / 0 / 0.
- **How:**
  - **First-visit lines.** Add a `firstVisitLines` source ahead of the ambient phase in `nowCaption` precedence (after arrival, transition and stale). Gate it on a new `localStorage` key `pharosville.orientation.seen`, set when the third line finishes or on the first user input. Timing: 7 s hold, chrome-2 crossfade.
  - **Legend copy.** Rewrite to three stanzas (ships, water, lighthouse), each ≤2 sentences, with the "Marks to look for" list kept behind the existing `<details>`. Delete the leg/rest jargon line and move the pace explanation to the ledger.
  - **Legend material.** Restyle `.pharosville-legend-panel` onto the chrome-3 material (day: washi; night: indigo). Headings become Garamond 600 18 px, not uppercase or gold.
  - **Stale flag.** Fix the preview `--legend` flag to open the legend explicitly (the flag is stale).
- **Displaces:** the harbormaster-style legend-as-onboarding; the 17-line landmark paragraph; gold 900-weight headings.
- **Truth & a11y:**
  - The three lines state the three coarse readings the bible names (`VISUAL_INVARIANTS.md:41-42`).
  - The screen reader gets one combined polite announcement.
  - **Reduced motion:** one combined sentence held until the first input; no sequence.
  - Skipped instantly by any input (existing arrival-skip listener pattern, `pharosville-world.tsx:1098-1109`).
- **Risks:** the orientation competes with an arrival-ceremony caption if both fire. Precedence puts the ceremony first and orientation resumes after. Legend tests pin some copy.
- **Acceptance:** fresh-profile motion sheet `#t=12 --settle 9500 --frames 6 --interval 4000`: three lines in sequence, then the now-line. A second run with the key set shows only the now-line.

### chrome-5 Nameplates and hover in one ink-label language
- **Picture:** When a ship arrives, its name appears above the hull like a caption brushed onto a painting. There is no box: a hairline drops 14 px from the words to the mast, *Resupply USD* in Garamond, with a small word under it: *danger*, in the band's tone, beside a tiny ◆. It fades in over half a second and fades out over most of a second. Hovering a ship raises the same kind of label, so the world has one voice for names.
- **Why:**
  - Defect 3: ~2:1 contrast, 10.5 px, pop-in, severity flattened.
  - The hover card is a separate idiom: a navy system-sans box with a gold border and drop shadow (`hover-golden.png` "Forte AUD / Skiff · Danger Strait"; `pharosville.css:1467-1490`).
  - The 7.4 px initials mark "OU" can't be read (`:1424-1439`; `harbor-label-chips.tsx:80-82,142-148`).
- **Impact:** 3 stunning / 3 poetic. **Confidence:** M.
- **Cost:** S. **Perf:** 0 / 0 / <0.05 ms for ≤2 labels [INFERENCE] / 0. No new per-frame JS: it reuses the existing per-frame `updateHarborLabelChipLayout` pass, and opacity is a CSS transition.
- **How:**
  - **Chip.** Remove the border, background, opacity .68 and initials mark. Name: Garamond 600 `clamp(13px, .5rem + .35vw, 16px)` in `var(--pv-text-on-air)`. Band word: Garamond italic 12.5 px, lowercase. Non-calm bands use the risk token plus a 7 px glyph (◆ warning/danger, ◇ alert, · watch).
  - **Legibility.** Soft ellipse scrim `radial-gradient(closest-side, color-mix(var(--pv-air-ink) 72%, transparent), transparent)` behind the text, plus `text-shadow: 0 0 1px var(--pv-air-ink)`.
  - **Leader.** `::after` 1 px × 14 px hairline at 45 %, below the text. `CHIP_GAP_PX` (`harbor-label-chips.tsx:5`) goes from 6 to 14 to make room.
  - **Fade.** `transition: opacity 600ms settle, visibility 0s linear 600ms` with `[data-visible=true]{opacity:1; transition-delay:0s}`; out at 900 ms.
  - **Hover.** `.pharosville-hover-tooltip__card` adopts the same classes. The title is the name; the meta line is the class and band words.
  - **Height.** `CHIP_HEIGHT_PX` (`:8`) goes from 18 to 34 for collision spacing.
- **Displaces:** the chip box and initials, the hover card's border, gold and shadow. It removes one visual idiom from the world.
- **Truth & a11y:**
  - These labels are `aria-hidden` duplicates (`harbor-label-chips.tsx:67`); the detail panel and ledger stay canonical.
  - Severity is now word plus glyph plus tone, not a grey word.
  - **Reduced motion:** no fade; arrival nameplates already skip under reduced motion (`garden-arrival-beats.ts:171`).
- **Risks:** a boxless label over bright sky at noon; the scrim must hold ≥4.5:1 there. The collision loop (`:118-120`) uses the chip height, so re-tune it.
- **Acceptance:** `#t=17.6`, `#t=12` and `#t=22` stills with an arrival nameplate: name ≥4.5:1 against its surround, no visible rectangle. A motion sheet across an arrival shows a fade, not a pop.

### chrome-6 Chrome that breathes with the light: continuous phase tokens and text roles
- **Picture:** As dusk comes on, the caption's pool of shade warms from slate to umber and then deepens to indigo. The card paper slowly takes on dye, and the Explore mark stays exactly as readable as it was at noon. Nothing in the chrome flips at one frame.
- **Why:**
  - `data-phase` is binary, set when `night > 0.5` (`pharosville-world.tsx:485-487`). At that instant every token swaps: the card jumps from tan to indigo and `--stone` flips to near-black (defect 2).
  - Golden and blue hours use the *day* navy chrome over an amber or violet sky (`golden.png` caption box).
  - Night controls miss AA (defect 7).
- **Impact:** 3 relaxing / 3 stunning. **Confidence:** M.
- **Cost:** M. **Perf:** 0 / 0 / one `:root` style write per minute (~0) / 0.
- **How:**
  - **Tokens.** Plain custom properties `--pv-air-ink`, `--pv-text-on-air`, `--pv-paper` and `--pv-paper-ink`, with **no CSS transition**. A 20 s transition on inherited `:root` variables would restyle the whole DOM every frame for 20 s, and CPU is the binding cost at 120 Hz (LaneHeadroom). A per-minute step of a smoothly interpolated colour is already below perception.
  - **Source.** A tiny `useChromeAir(hour)` writes them each minute from the same beat weights used for the caption (`captionBeats`, `pharosville-world.tsx:281`). Mix per-beat anchors derived from the palette (day `--water`-dark; golden `color-mix(--stone 70%, --ink)`; blue `color-mix(--water, --pv-panel-deep)`; night `--pv-bg`).
  - **Text roles.** Add `--pv-text`, `--pv-text-quiet`, `--pv-link`, each AA-checked against its paper for each beat. Migrate every text use of `--stone` and `--mist` to them.
  - **Clean-up.** Retire the night redefinitions of shared tokens (`pharosville.css:86-101,728-732,759-761,1227-1231`).
  - **Contract.** A unit test asserts ≥4.5:1 for each role pair at the five beat anchors and at the midpoints between them.
- **Displaces:** the binary token flip and three per-component night overrides.
- **Truth & a11y:**
  - The chrome follows the wall clock only, never market data (channel treaty).
  - **Reduced motion:** identical, since nothing animates. The tokens step once per minute.
- **Risks:** a colour hand-rolled in JS drifts from the CSS mirror. Derive the anchors from `systems/palette.ts` in one module. An existing palette-mirror test may pin the CSS hex values.
- **Acceptance:** captions and a card at `#t=17.6`, `#t=18.8` and `#t=22`. The golden scrim is warm, not navy; every text pair is ≥4.5:1; a 60 s motion sheet across 19.9→20.1 shows no single-frame chrome jump.

### chrome-7 Quiet controls: a word, not a hamburger; drawers, not native forms
- **Picture:** Bottom-right sits one italic word, *explore*, with a small `/` key cap beside it. On approach, a row of words unfolds leftward: *find · legend · ledger*, then three hairline-ringed glyphs (reset, observe, light). The light drawer opens on the same paper as the card: a time field set in tabular figures, "local time" and "still" as quiet toggles, 44 px targets, a lantern focus ring.
- **Why:**
  - The Menu (hamburger) icon plus 600-weight 12 px sans in a navy pill is app chrome (`world-controls.tsx:138-140`; `pharosville.css:796-817`), bottom-right in `noon.png`.
  - The revealed row repeats dark rounded pills.
  - The light drawer is unstyled (defect 8).
  - The sound lane is adding a sibling drawer (coordinated with LaneSound: it builds on the shared drawer style).
- **Impact:** 2 relaxing / 2 stunning. **Confidence:** H.
- **Cost:** S. **Perf:** 0 / 0 / 0 / 0.
- **How:**
  - **Affordance.** Remove the `Menu` icon. The affordance label becomes Garamond italic 16 px "explore"; the `kbd` is `font-ui` 11 px with a 1 px border at 35 % and radius 3.
  - **Revealed row.** Revealed `.pv-chrome-action` becomes text-only Garamond 15 px, separated by 18 px gaps and middots, with the same feathered scrim as chrome-2 behind the whole row. Glyph buttons get a transparent fill and a 1 px `--pv-text-quiet` ring.
  - **Drawers.** Add a shared `.pv-drawer` class for `.pharosville-light-control__panel` and the Sound panel, using the chrome-3 material. Labels in Garamond, controls in `font-ui` 500. Style `input[type=time]` with `tabular-nums`, no native chrome, and a hairline bottom border; checkboxes become 36×20 hairline switches.
  - **Idle state.** Keep the existing reveal logic (`pharosville.css:783-790`).
- **Displaces:** the hamburger, the navy pills, native form styling.
- **Truth & a11y:**
  - `aria-label`s are unchanged; the whole toolbar `role` and keyboard order are unchanged.
  - Touch targets stay 44 px under `(hover:none)` (`:859-869`).
  - **Reduced motion:** the reveal is instant.
- **Risks:** an italic word is less recognisable as a control than an icon. Keep the `/` kbd and a hover underline, and let a11y review discoverability.
- **Acceptance:** `#t=12` and `#t=22` bottom-right crops show no filled pill at rest and text ≥4.5:1. A capture with the light drawer open shows no native grey buttons.

### chrome-8 An ink type system: two faces, clear roles, a fluid scale
- **Picture:** Every word in the product sits in one of two voices. Garamond is the garden speaking: titles, captions, prose, names. A quiet sans is the instrument: figures, times, keys, controls. There are no shouted capitals, no bold numerals, and nothing smaller than 12 px, and type grows with the picture on large displays.
- **Why:**
  - The tokens exist (`pharosville.css:48-54`), but the rules ignore them. Tracked uppercase appears in the card kind (`:544-550`), section titles (`:880-886`), ledger `h3`/`dt` at weight 900 and 0.16 em (`:1130-1156`), and the Observe eyebrow (`:1515-1524`).
  - Figures are 600–700 weight throughout.
  - Changelog and legend sizes run 0.92–2.06 rem ad hoc.
  - A 7.4 px monospace mark exists.
  - Only the 400 weight is preloaded (`index.html:14`), so the 600 titles swap in late on first panel open.
  - The bundled 700 file has no `@font-face`: dead weight.
- **Impact:** 3 poetic. **Confidence:** H.
- **Cost:** S–M. **Perf:** 0 / 0 / 0 / 0. +24 KB early preload (600), −23 KB repo (700 deleted).
- **How:**
  - **Roles.** `--type-caption: clamp(17px,.7rem+.5vw,23px)`, `--type-title: clamp(26px,1.2rem+.6vw,34px)`, `--type-prose: 16.5px/1.5`, `--type-figure: 15px`, `--type-label: 12.5px` (italic Garamond, lowercase), `--type-key: 11px`.
  - **Weights.** Garamond 400/600 only; sans 500 for figures and 400 for controls.
  - **Tracked caps.** Replace every `text-transform: uppercase` in chrome with italic lowercase labels.
  - **Figures.** Set `font-variant-numeric: tabular-nums lining-nums` on all figures and `hanging-punctuation: first` on prose. Use U+2212 minus and U+2009 thin spaces around middots in reading lines (`buildDetailReadingLine`).
  - **Fonts.** Preload `eb-garamond-600-latin.woff2` and delete `public/fonts/eb-garamond-700-latin.woff2`.
- **Displaces:** tracked uppercase labels, 900-weight headings, bold figures, ad-hoc rem sizes, the monospace chip mark.
- **Truth & a11y:** no meaning changes. The 12 px floor improves readability, and fluid sizing respects the user's zoom (clamp uses rem).
- **Risks:** widespread CSS churn touches the ledger and changelog; screenshot baselines may shift.
- **Acceptance:** a CSS grep shows no `text-transform: uppercase` in chrome selectors, and no font-size below 0.75 rem outside `.sr-only`. `noon-1440p` shows the caption phrase ≥21 px and card title ≥32 px.

## Subtractions
- The **Menu (hamburger) icon** in Explore (`world-controls.tsx:138`).
- The chip's **initials mark** and the chip box/opacity (`pharosville.css:1400-1439`; `harbor-label-chips.tsx:80-82,142-148`).
- The **4 px hard offset shadows** on the card and ledger records (`:503,731,1190,1230`).
- The caption **text-shadow inside an opaque box** (`:755`).
- The **hover card's gold border and drop shadow** (`:1474-1482`).
- The **tracked uppercase eyebrows**: "SHIP"/"LIGHTHOUSE" (`:544-550`), "OBSERVE" (`:1515-1524`), ledger headings (`:1130-1156`).
- The **loading veil's violet gradient** and centred 600-weight tracked label (`:135-146`).
- The gate's **94 % dark slab** (`:249-253`) and the 3 px "beacon" bar (`:273-278`, decoration).
- The **unused `eb-garamond-700-latin.woff2`**.
- The **duplicate hover rule** `.pharosville-changelog-panel__close:hover` (`:1003-1008`).
- The legend's **"leg/rest contract" sentence** (`legend-panel.tsx:195-201`).

## Reversals
1. **W5.6: "loading = held establishing still + 320 ms crossfade"** (`agents/pharosville-reborn/01-implementation-plan.md:213`; `garden-arrival.ts:4`).
   - **Evidence:** the held still is the wrong hour and carries stale UI (`garden-noon.jpg`). A 320 ms cut between two unrelated images reads as a pop, which is exactly what the veil was built to avoid (`pharosville-world.tsx:1059-1064`).
   - **Argument:** 320 ms was chosen to kill the old nine-second branded veil. With a still matched to the hour and pose, a 1.4 s dissolve is not a veil but the first moment of the experience, and input still skips it.
   - **Risk:** stills must be regenerated whenever the rest camera or the scene changes. Make that a release step.
2. **"The legend stays closed on first visit and opens only on demand"** (`src/hooks/use-legend-dialog.test.tsx:46`), together with the deferral of W5.3 onboarding to Ext (`01-implementation-plan.md:210,352`).
   - **Evidence:** a first-time visitor today gets "12:15 — a quiet noon · readings current" and nothing that says a sail is a stablecoin (`noon.png`).
   - **Argument:** the fix need not be a modal or a three-beat camera story. Three timed lines in the existing caption slot (chrome-4) teach the three bible readings at zero screen cost.
   - **Risk:** repeat-visit annoyance if storage is unavailable. Treat unavailable storage as seen, matching `isLegendDismissed`.
3. **"Paper grain" on the rejected list** (`01-implementation-plan.md:336`). I believe chrome-3 does not violate it, but I flag it for transparency.
   - **Evidence:** that line rejects grain as a *scene post-process* ("equalise edges, tax logos, fight calm").
   - **Argument:** a static 5 % fibre texture on DOM reading surfaces (card, ledger records, drawers) touches no pixel of the world and costs no GPU time.
   - **Risk:** if the operator reads the rejection as covering any grain, fall back to the flat washi colour. It keeps ~80 % of the gain.
4. **The binary `data-phase` day/night token swap** (`pharosville.css:86-101`; `pharosville-world.tsx:485-487`).
   - **Evidence:** night links at 1.23:1 (`chrome/selected-ship-night.png`); the day navy chrome sits under golden hour (`golden.png`).
   - **Argument:** replace it with continuous tokens stepped each minute, plus text roles (chrome-6). The wall clock already owns illumination, so the chrome should follow the same curve.
   - **Risk:** palette-mirror tests re-pin.

## Cross-lane dependencies
- **Data story:**
  - owns the chrome-2 vocabulary (hour words, a PSI-band tone word per band, arrival copy without "in the window");
  - the chrome-4 first-visit lines;
  - the contradictory calm-seal / DEWS-stress narrative on `selected-ship.png` (`detail-model.ts:1088`).
- **Sky / light:**
  - publish per-beat horizon/zenith anchors so chrome-6's `--pv-air-ink` derives from the real sky;
  - confirm the beat windows used by `stillForLocalHour` (chrome-1).
- **Art director / composition:** the five regenerated stills (chrome-1) must be taken at the arrival start pose. Any rest-camera change invalidates them.
- **Life / director:** arrival nameplate timing (`garden-arrival-beats.ts:132-134`). chrome-5 adds a 600/900 ms fade, and the 10 s nameplate window should include it.
- **Sound (LaneSound):** its drawer uses the shared `.pv-drawer` material from chrome-7. Agreed by IRC.
- **Accessibility:** approve the chrome-3 heading-focus change, the chrome-2 live-region split, and the discoverability of the chrome-7 italic "explore".
- **Tooling:** the preview `--legend` flag is stale (the legend never auto-opens), and preview needs a `--clean` (chrome-free) flag for chrome-1.
- **Rendering headroom:** nothing needed. Every idea here is 0 draws / 0 tris / 0 scene textures.

# O8 · UI/HUD visual design and first-impression surfaces

Lane O8 (Opus). Baseline v1.4.1 `29e0b2a3`. All captures went through the real-GPU `shot.mjs` and `dom-shot.mjs`: 11 UI states plus 1 mockup board, with crops and notan studies derived from them. Mockups: `agents/pharosville-ultimate/mockups/O8-*`.

## 1. Verdict

By day on a desktop, the PharosVille chrome is already more crafted and more distinctive than Apple Maps, Windy, Felt or Flightradar24. It has a real chart voice: EB Garamond, paper grain, a double neatline, brass hairlines, U+2212 minus signs, and tabular lining figures (I verified the subset's default figures are lining). The arrival card (`O8-arrival.png`) and the search card (`O8-search-day.png`) are excellent; keep them.

It falls behind those products on **systematic** and **adaptive** design:
- One material for every hour, so at night the paper out-shines the Pharos.
- Hand-set values: 26 font sizes and ~50 colour literals.
- No single control family.
- A fixed touch sheet.
- A phone page that drops the voice.

The direction I propose, **"Pilot's Chart"**, keeps the voice and adds a system:
- one family, eight type steps, a 4 px spacing scale, and tokens everywhere;
- an S-52-style *night bridge* palette (S-52 is the IHO standard that gives marine chart displays day/dusk/night colour tables, so the most nautical answer here is a night palette);
- one control family, a detented sheet, and gate pages in the harbour's voice.

## 2. Current state (frames)

- **Day:** the panel, tag, search and ledger all sit well on the bright world (`O8-boat-panel-day.png`, `O8-ledger-legend-day.png`). Paper at L\* 94 is close to the sky.
- **Night:** the same paper sits on a scene at L\* ≈ 20 (`O8-night-chart-harbourmaster.png`).
  - In the notan (`O8-notan-night-ui.png`), the chrome is the only bright mass. The panel alone holds 81 % of the frame's L\* > 80 pixels.
  - On the home night view (`O8-notan-base-night.png`), the 382×32 corner mark holds **≈84 %** of the brightest 0.7 % of pixels; the Pharos lantern holds ≈12 %.
- **Sunset:** warm paper on warm light is the UI's best hour (`O8-pharos-panel-sunset.png`).
- **Tablet:**
  - The touch strip is lowercase words with no visible affordance (`aspect-tablet-landscape.png`).
  - The 700 px ledger can't fit seven Coins columns (`O8-tablet-ledger-coins.png`).
  - The portrait sheet is a fixed 50dvh box with lines of 110+ characters (`O8-tablet-portrait-sheet.png`).
- **Phone and blocked window:** a navy page with a system sans body and a plain list of links (`base-phone-welcome.png`, `O8-blocked-700x560.png`). Its design language differs from the arrival card in the same file (`arrival-shell.css:36-85` vs `:95-134`). At 700×560 the actionable sentence is below the fold.
- **Postcard:** the print is framed three times over, and the buttons are inline-styled (`O8-postcard.png`, `Postcard.tsx:5-9`).
- **Keep as they are:** focus return (`App.tsx:30-45`), roles and live regions, reduced motion, one ease curve at 150–320 ms, and the chart-paper unroll (`harbour-ui.css:465-471`).

## 3. Findings (ranked)

1. **[high] F1 · At night the chrome is brighter than the Pharos.**
   - The tokens are fixed day values (`harbour-ui.css:8-25`), and no code under `ui/` reads the night factor (see the notan numbers above).
   - Fix: I1.
2. **[medium] F2 · No type system, and italics carry no meaning.**
   - 26 sizes in half-pixel steps; labels at 9.5–10.5 px (`:189,390,399`) are illegible at Garamond's x-height.
   - About 20 italic rule groups, including the main explanatory paragraph (`.hb-why :165`), `.hb-sub :158` and the captions (`:201`).
   - Fix: I2.
3. **[medium] F3 · Hard-coded colour, so no theme is possible.**
   - 31 hex and ~20 `rgba()` literals, plus SVG inks in TSX (`bits.tsx:78-82,100-109,129`; `Search.tsx:35-49`) and canvas colours (`postcard.ts:65-84`).
   - Fix: I2. S23-I3 leaves the values to this lane; they are in `O8-pilot-chart.css`.
4. **[medium] F4 · Seven control treatments and no primary action.**
   - The strip (`:95-98`), chips (`:234-239`), sorts (`:241-244`), tabs (`:325-328`) and follow (`:169-171`).
   - The postcard's inline buttons, inline because "the Harbour CSS sits at its byte budget" (`Postcard.tsx:5`).
   - The welcome page's grey sans button (`arrival-shell.css:121-124`).
   - Fix: I3.
5. **[medium] F5 · The welcome page is the least crafted surface.**
   - It uses a system sans (`arrival-shell.css:14,19,101`), with no paper, brass or glyphs.
   - S08 already holds the content defects (F5 the two PSI names at `fallback-links.ts:2`/`index.html:85`; F6 the reason comes last). This finding is about the visual voice.
   - Fix: I5.
6. **[medium] F6 · Freshness and modes are colour-only or invisible with a mouse.**
   - The collapsed mark is just the wordmark and a 7 px dot (`:86-92`). "Stale" is an amber dot at **2.58:1** (`:78`): below 3:1, and colour-only, against PRODUCT.md.
   - C mode has no on-state: `.hb-chart-badge` (`:316`) is never rendered.
   - Fix: I7.
7. **[medium] F7 · Two "now" numbers in the PSI panel.**
   - The sparkline ends on the last daily close, 88.7 (`bits.tsx:82`), labelled "today" (`:84`), under the live 91.4 (`Panel.tsx:248-252`, again at `:832`). Related to S02-F11.
   - Fix: I9.
8. **[medium] F8 · The ledger overflows on tablets.**
   - Seven Coins columns (`Ledger.tsx:183-189`) in a 700 px sheet: State and Grade sit behind a nested horizontal scroll, and the coin name wraps under the symbol.
   - Fix: I8.
9. **[medium] F9 · The sheet has no detents, no grabber and unlimited line length** (`harbour-ui.css:439-452`). S07-I6 covers the sheet heights. Fix: I4.
10. **[low] F10 · Some glyphs fall back to a system font.**
    - † → ↗ ← ≥ are not in the 236-glyph subset (I checked with fontTools).
    - Used at `facts.ts:228`, `Search.tsx:50`, `events.ts:345`, `Ledger.tsx:210`, `Panel.tsx:474,698` and `KeyList.tsx:10`.
    - Fix: I10.
11. **[low] F11 · In-world signs are painted in Georgia/Times** (`civic/paint.ts:9`, `shipyard.ts:354-369`, `wreck-cove.ts:375-383`, `emblems.ts:202`), not EB Garamond. On Linux, ChromeOS and Android they fall back to Liberation or DejaVu.
12. **[low] F12 · The postcard is framed three times** (`Postcard.tsx:7-8`, `postcard.ts:64-75`). S20, S05 and S07 own its behaviour. Fix: I11.
13. **[low] F13 · Hygiene.**
    - `lucide-react` is declared (`package.json:80`) but never imported.
    - The 21 inline SVGs already share a 1.1–1.3 stroke.
    - Dead CSS: `.hb-chart-badge`, `.hb-epitaph`, `.hb-latest`.
14. **[low] F14 · The unfurl copy describes a retired world**: `lighthouse`, `pigeonnier`, "the water under its hull is peg risk" (`functions/index.ts:68-77,110`). Pair the fix with S20-I1.

## 4. The direction: "Pilot's Chart"

**Type: one family, eight steps.**

| role | size/weight | use |
|---|---|---|
| cap | 11.5/600, +0.12 em caps | kickers, section and table heads, tabs |
| note | 13.5 italic | captions, axis notes, hints, freshness |
| small | 14.5 | coin names, chips, secondary rows |
| body | 16 | rows, dd, menus, the "why" paragraph (**roman**) |
| lead | 17.5 | tag name, results, legend titles |
| h3 | 21/600 | search field, epitaph, gate headline |
| title | 30/600 (26 long) | panel and ledger titles |
| display | 38/600 | the panel's one key figure |

- **Italics follow chart convention.** Roman means facts and land. Italic means only water names, notes and decoration ("out for a sail"), so italic says "not a reading".
- **Minimum sizes:** 11.5 px for tracked caps, 13 px for lowercase.
- **No sans.** Garamond's tabular lining figures scan well, and a second family reads as a dashboard.

**Colour tokens (contrast on paper).**

| token | Day | Night bridge |
|---|---|---|
| paper / -2 / -3 | #f4ecda / #ebe0c6 / #e2d4b4 | #18212b / #1f2a36 / #283543 (L\* 12–22) |
| ink / -2 / -3 | #23201a 13.8 · #4a4236 8.4 · #6a5e4b 5.4 | #e6dcc6 11.9 · #c8bda5 8.7 · #aba18c 6.4 |
| brass-ink / rule | #7a5a22 5.4 / #a68242 3.0 | #cfae6e 7.7 / #a88a52 5.0 |
| link · up · down · focus | #1f5873 6.6 · #3f6e52 5.0 · #a3372a 5.7 · #1668a3 5.0 | #8ec1d9 8.3 · #8fc7a0 8.4 · #ec9c8b 7.5 · #7fb8ea 7.7 |
| live / stale | #3f8a5e 3.6 / **#9c6a17 4.0** (was 2.58) | #5fb07f 6.2 / #d9a441 7.2 |

- **Switching to night:**
  - Read `ctx.uniforms.uNight` at the existing 1 Hz tick (`store.ts:153`).
  - Hysteresis: night above 0.55, day again below 0.45.
  - A 1.2 s crossfade, or a cut under reduced motion.
  - The chart-name halo inverts.
- **Spacing:** 4/8/12/16/20/24/32. Panel inset 24, section gap 20, head-to-content 8. Controls 32 px (44 on coarse pointers). Radius 1 for sheets, 2 for controls.
- **Motion:** 150 ms hover, 220 ms open and slip, 320 ms unroll, 1200 ms palette change.

**Components** (drawn in `O8-specimen.html`):
- **Button:** 32 px with a 1 px rule border; hover wash-2, pressed wash-3.
  - **Primary:** ink fill, at most one per surface.
  - **Text:** link colour with an offset underline.
  - **Icon:** 32 px, glyph 16 px at 1.25 stroke.
- **Chip:** 28 px, inset neat ring, 8 px swatch, count shown as a note.
- **Close:** round, always paired with **Copy link** to its left.
- **Tabs:** caps label, count in roman figures, selected tab gets a 2 px rule underline.
- **Table:**
  - sticky caps header, rows 32/44 px, right-aligned tabular numbers;
  - the coin cell stays on one line;
  - columns get priorities via a container query;
  - hovering a row lifts the hull.
- **Sheet:** 40×4 grabber; detents at peek (≈132 px), half and 92 %; body limited to 46 em, two columns from 700 px.
- **Slip (the only toast):**
  - bottom-centre of the free area, holding an icon, a caps label, one line and an optional action;
  - confirmations last 3.5 s; modes stay until turned off;
  - announced politely, one at a time;
  - answers the visitor's own actions only, **never** market events (D11).

## 5. Ideas

| id | idea | pillar | effort | impact |
|---|---|---|---|---|
| I1 | Night bridge palette driven by `uNight` | prettier | M | 5 |
| I2 | Tokens: 8-step type, italics grammar, 4 px space, SVG and canvas inks as tokens | professional | M | 4 |
| I3 | One control family | professional | S–M | 3 |
| I4 | Sheet with grabber and three detents, two-column body with limited line length | all-devices | M | 4 |
| I5 | Welcome pages in the harbour's voice, action first, a live window gauge | all-devices | S–M | 4 |
| I6 | Toolbar "/ Search · L Ledger · C Names · H Home · ⋯"; touch uses icon+label and a More menu (Home, Postcard, Watch, Legend) | all-devices | S | 3 |
| I7 | Visible state: the word whenever not live, a ring-and-bar mark for stale, slips for modes | professional | S | 4 |
| I8 | Responsive ledger table; row hover lifts the hull | informative | M | 3 |
| I9 | Dated sparkline with a hollow "now" = `psi.score` | informative | S | 3 |
| I10 | Subset gains † ← ↑ → ↓ ↗ ≤ ≥ ≈; signs painted in EB Garamond | professional | S | 2 |
| I11 | Postcard as a print on the veil; Save, Copy and Share… | professional | S | 3 |
| I12 | One hairline icon set: adopt lucide at 1.25 stroke or drop it; stronger legend glyphs | professional | S | 2 |
| I13 | Panel page-turn: a 160 ms crossfade on the existing `page` sound cue (`SoundToggle.tsx:28`) | enchanting | S | 2 |

## 6. Top picks (impact ÷ cost)

1. **I1 Night bridge palette.** The most visible fix; it returns the night to the Pharos.
2. **I7 Visible state.** About a day of work; it removes a colour-only freshness cue and invisible modes.
3. **I2 Tokens and type scale.** The enabler for I1 and I3, and it frees CSS budget.
4. **I5 Welcome in voice.** The first impression on every phone; its fonts are already preloaded and it loads no data.
5. **I9 Dated sparkline.** Small and testable; it removes the two-number confusion on the most-visited panel.

I4 (sheet detents) comes sixth; S07 owns its gesture work.

## 7. Decisions for the operator

1. **DECISION-NEEDED:** approve the dark bridge palette at night? It reinterprets D12's "chart-paper panels" in the S-52 tradition. The alternative is dimmed paper at L\* ≈ 84, still about 4× the scene. I recommend the bridge palette.
2. One serif family (recommended), or add a data sans (+20–30 KB)?
3. Toolbar wording: title case with key caps, rename "chart" to "Names", and add the ⋯ overflow?
4. Lucide: adopt it for the eight utility icons, or remove the dependency?
5. Harbour CSS cap: allow +2 KiB raw / +0.6 KiB gzip, or require offsetting deletions? Dead rules and deduplicated washes free about 0.8 KiB.
6. Add a discreet wordmark lockup to the OG card (no numbers)?

## 8. Mockups and captures

- **Spec in code:** `mockups/O8-pilot-chart.css` (tokens and components for both palettes).
- **Mockup pages:**
  - `O8-harbour-ui.html?v=day|night`: day has a ship selected, the toolbar open and a "Link copied" slip; night has the bridge palette, the Pharos panel with a dated sparkline, and a "Postcard saved" slip.
  - `O8-touch.html?v=phone|window|sheet`.
  - `O8-specimen.html`.
  - `O8-board.html`, the index.
- **Render:** `shots/O8-mockup-board.png`, with crops `O8-mock-{A-day,B-night,C-specimen,D-phone,E-window,F-sheet}.png`.
  - The board was rendered before the stylesheet gained its one-line `<button>` serif reset, so toolbar and chip labels show the browser's default sans. The HTML is now correct.
  - The night artboard keeps a faint blur where the old corner mark was patched out.
- **UI-state captures:** `O8-search-day`, `O8-ledger-legend-day`, `O8-boat-panel-day`, `O8-night-chart-harbourmaster`, `O8-pharos-panel-sunset`, `O8-postcard`, `O8-tablet-ledger-coins`, `O8-tablet-portrait-sheet`, `O8-arrival`, `O8-blocked-700x560`, `O8-phone-landscape`.
- **Derived images:** `O8-notan-*`, `O8-crop-*`.
